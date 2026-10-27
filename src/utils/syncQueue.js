import { STORAGE_KEYS, loadJSON, saveJSON } from "../data/storage";
import { ERPNextError } from "../api/erpClient";

// Antrian sinkronisasi offline -- buat "nyelametin" aksi yg gagal kekirim ke ERP gara-gara
// nggak ada sinyal, BUKAN buat aksi yg ditolak server (validasi/izin salah, dll -- itu nggak
// akan pernah berhasil walau diulang terus, jadi langsung ditampilin ke user, nggak diantri).
// Dibedain lewat ERPNextError: itu CUMA dilempar kalau request-nya BENERAN nyampe server & server
// yg nolak (lihat erpClient.js). Kalau fetch()-nya sendiri gagal (nggak ada sinyal/timeout),
// errornya BUKAN ERPNextError -- itu yg masuk antrian buat dicoba lagi nanti.
export function isRetriableSyncError(err) {
  return !(err instanceof ERPNextError);
}

function makeJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getQueue() {
  return loadJSON(STORAGE_KEYS.syncQueue, []);
}

async function setQueue(queue) {
  await saveJSON(STORAGE_KEYS.syncQueue, queue);
}

// Semua baca-ubah-tulis ke antrian (enqueue SATU tugas baru, ATAU proses ulang semuanya) harus
// gantian, nggak boleh numpuk/tumpang tindih -- kalau nggak, ada celah: enqueueSyncJob baca
// antrian lama, lalu SEBELUM dia nulis balik, processSyncQueue (dipicu bareng dari trigger lain,
// mis. app balik aktif tepat pas 1 aksi baru gagal) juga baca antrian lama yg SAMA, proses, dan
// nulis balik versi tanpa tugas baru itu -- tugas yg barusan di-enqueue ikut KETIMPA/HILANG.
// `runExclusive` antri tiap operasi lewat 1 promise chain tunggal biar selalu urutan, satu per
// satu, nggak peduli dari trigger mana asalnya.
let queueLock = Promise.resolve();
function runExclusive(fn) {
  const result = queueLock.then(fn, fn);
  queueLock = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

// Tambah 1 tugas ke antrian. `kind` nentuin executor mana yg bakal jalanin ulang nanti (lihat
// processSyncQueue), `payload` itu data mentah yg dibutuhin executor buat ngulang aksinya --
// harus bisa di-JSON.stringify (nggak boleh ada function/class instance di dalemnya).
export function enqueueSyncJob(kind, payload) {
  return runExclusive(async () => {
    const queue = await getQueue();
    queue.push({ id: makeJobId(), kind, payload, createdAt: Date.now(), retryCount: 0 });
    await setQueue(queue);
  });
}

export async function getPendingSyncCount() {
  const queue = await getQueue();
  return queue.length;
}

// Salinan isi antrian saat ini (array {id, kind, payload, createdAt, retryCount}) -- dipakai UI
// buat nunjukkin item MANA yg masih nunggu dikirim (mis. badge "Menunggu dikirim" di baris
// Pengiriman), bukan cuma jumlahnya doang.
export async function getQueueSnapshot() {
  return getQueue();
}

// Coba jalanin ulang SEMUA tugas yg masih nyangkut di antrian, satu-satu sesuai urutan masuk.
// `executors` itu peta { [kind]: async (payload) => void }. Kalau executor-nya throw lagi dgn
// error yg retriable (masih soal sinyal), tugas itu DIBIARIN di antrian buat dicoba lagi nanti.
// Kalau sukses, atau ditolak server (non-retriable), tugas itu dibuang dari antrian.
// `onChange(remainingQueue)` dipanggil tiap abis ada perubahan isi antrian (buat badge di UI).
// Dipicu dari beberapa trigger independen (app balik aktif, timer berkala, koneksi balik online)
// yg bisa kejadian nyaris bersamaan -- `runExclusive` (lihat atas) mastiin nggak overlap satu
// sama lain ATAU sama enqueueSyncJob, jadi nggak ada job yg kekirim dobel atau ketimpa/hilang.
export function processSyncQueue(executors, onChange) {
  return runExclusive(async () => {
    const queue = await getQueue();
    if (queue.length === 0) return;

    const remaining = [];
    let changed = false;
    for (const job of queue) {
      const executor = executors[job.kind];
      if (!executor) {
        changed = true; // kind nggak dikenal (versi app lama) -- buang drpd nyangkut selamanya
        continue;
      }
      try {
        await executor(job.payload);
        changed = true; // berhasil -- nggak dimasukin lagi ke `remaining`
      } catch (err) {
        if (isRetriableSyncError(err)) {
          remaining.push({ ...job, retryCount: job.retryCount + 1 });
        } else {
          console.error(`Sync job "${job.kind}" ditolak server, dibuang dari antrian:`, err);
          changed = true;
        }
      }
    }

    if (changed) {
      await setQueue(remaining);
      onChange?.(remaining);
    }
  });
}
