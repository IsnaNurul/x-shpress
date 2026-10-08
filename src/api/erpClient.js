import * as FileSystem from "expo-file-system/legacy";

const BASE_URL = (process.env.EXPO_PUBLIC_ERPNEXT_URL || "").replace(/\/$/, "");
const DEFAULT_API_KEY = process.env.EXPO_PUBLIC_ERPNEXT_API_KEY;
const DEFAULT_API_SECRET = process.env.EXPO_PUBLIC_ERPNEXT_API_SECRET;

export class ERPNextError extends Error {}

// Kredensial per-user (diisi setelah login asli email+password berhasil & token-nya dibuat).
// Kalau belum ada (belum login), request() jatuh balik ke key bawaan .env (dipakai cuma utk
// hal-hal yang memang tidak butuh identitas kurir spesifik, mis. cek sebelum login).
let dynamicKey = null;
let dynamicSecret = null;

export function setErpCredentials(key, secret) {
  dynamicKey = key;
  dynamicSecret = secret;
}

export function clearErpCredentials() {
  dynamicKey = null;
  dynamicSecret = null;
}

function authHeaders() {
  const key = dynamicKey || DEFAULT_API_KEY;
  const secret = dynamicSecret || DEFAULT_API_SECRET;
  return { Authorization: `token ${key}:${secret}` };
}

export function erpFileUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${BASE_URL}${path}`;
}

function parseErrorMessage(json, fallbackText) {
  if (!json) return fallbackText.slice(0, 300);
  if (json.message && typeof json.message === "string") return json.message;
  if (json.exception) return String(json.exception).split("\n").pop();
  if (json._server_messages) {
    try {
      const msgs = JSON.parse(json._server_messages);
      const first = JSON.parse(msgs[0]);
      return first.message || fallbackText.slice(0, 300);
    } catch (e) {
      // abaikan, pakai fallback di bawah
    }
  }
  return fallbackText.slice(0, 300);
}

async function request(method, path, { params, body, isForm } = {}) {
  if (!BASE_URL) {
    throw new ERPNextError("Konfigurasi ERPNext belum lengkap (cek file .env).");
  }
  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      qs.append(k, typeof v === "string" ? v : JSON.stringify(v));
    });
    const qsStr = qs.toString();
    if (qsStr) url += `?${qsStr}`;
  }

  const res = await fetch(url, {
    method,
    headers: isForm ? authHeaders() : { ...authHeaders(), "Content-Type": "application/json", Accept: "application/json" },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    json = null;
  }

  if (!res.ok) {
    throw new ERPNextError(parseErrorMessage(json, text));
  }
  return json;
}

export async function erpGetList(doctype, { fields, filters, limit = 100, orderBy } = {}) {
  const params = { limit_page_length: limit };
  if (fields) params.fields = fields;
  if (filters) params.filters = filters;
  if (orderBy) params.order_by = orderBy;
  const json = await request("GET", `/api/resource/${encodeURIComponent(doctype)}`, { params });
  return json.data || [];
}

export async function erpGetDoc(doctype, name) {
  const json = await request("GET", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return json.data;
}

export async function erpUpdateDoc(doctype, name, data) {
  const json = await request("PUT", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { body: data });
  return json.data;
}

export async function erpCreateDoc(doctype, data) {
  const json = await request("POST", `/api/resource/${encodeURIComponent(doctype)}`, { body: data });
  return json.data;
}

// Hapus 1 dokumen ERP -- dipakai utk "rollback" kalau sebagian dari 1 aksi gagal (mis. dokumen
// utamanya sukses dibuat tapi foto buktinya gagal diupload), biar nggak ada data cacat/setengah
// jadi yg nyangkut di ERP.
export async function erpDeleteDoc(doctype, name) {
  await request("DELETE", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
}

// Upload file foto (lokal di HP, uri file://...) ke ERP lewat endpoint upload_file bawaan Frappe,
// lalu dipasang ke field Attach/Attach Image tertentu di 1 dokumen yg sudah ada. isPrivate default
// false supaya URL-nya bisa langsung ditampilkan (<Image>/Lightbox) tanpa perlu header auth --
// kalau private, cuma bisa diakses lewat sesi/API key login, dan mobile tidak kirim itu saat
// nge-render gambar. Catatan: upload_file TIDAK selalu otomatis ngisi field di dokumen induknya
// (sudah dicek langsung ke ERP X-SHA -- field-nya tetap kosong walau sudah kasih fieldname), jadi
// di sini di-set manual lewat PUT biar pasti tersimpan, bukan cuma tercatat di File doc-nya.
// Catatan lain: dua cara JS biasa buat attach file ke FormData TERNYATA SAMA-SAMA BERMASALAH di
// RN 0.86 -- (1) objek `{uri, name, type}` -> "Unsupported FormDataPart implementation" (trik lama
// ini sudah tidak didukung lagi), (2) `fetch(uri).blob()` -> Blob-nya "nyambung" tapi isinya rusak
// pas sampai di server ("PIL.UnidentifiedImageError: cannot identify image file"), krn Blob RN itu
// cuma referensi native (bukan byte asli di JS), nggak dibaca benar oleh multipart encoder-nya
// fetch. Solusinya pakai `expo-file-system`'s `uploadAsync` (native, lewat modul Expo sendiri,
// BUKAN fetch/FormData JS) -- ini cara resmi Expo utk multipart upload file lokal & terbukti kirim
// byte asli dgn benar.
export async function erpUploadFile({ doctype, docname, fieldname, fileUri, fileName, isPrivate = false }) {
  const result = await FileSystem.uploadAsync(`${BASE_URL}/api/method/upload_file`, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType: "image/jpeg",
    headers: authHeaders(),
    parameters: {
      doctype,
      docname,
      ...(fieldname ? { fieldname } : {}),
      is_private: isPrivate ? "1" : "0",
    },
  });
  let json;
  try {
    json = result.body ? JSON.parse(result.body) : null;
  } catch (e) {
    json = null;
  }
  if (result.status < 200 || result.status >= 300) {
    throw new ERPNextError(parseErrorMessage(json, result.body || ""));
  }
  const fileDoc = json ? json.message : null;
  if (fieldname && fileDoc && fileDoc.file_url) {
    await erpUpdateDoc(doctype, docname, { [fieldname]: fileDoc.file_url });
  }
  return fileDoc;
}

export async function erpWhoAmI() {
  const json = await request("GET", "/api/method/frappe.auth.get_logged_user");
  return json.message;
}

// ===== Login asli (email + password akun ERP sungguhan) =====
// Memakai endpoint bawaan Frappe (TIDAK butuh perubahan apa pun di ERP):
//  1. /api/method/login -> autentikasi usr/pwd, ERP set session cookie.
//  2. frappe.core.doctype.user.user.generate_keys -> bikin API Secret baru utk akun itu
//     (API Key-nya sendiri dibaca lewat resource User di bawahnya).
// Hasil akhirnya: API Key + API Secret MILIK AKUN ITU SENDIRI, dipakai utk semua request
// selanjutnya (lewat setErpCredentials) -> visibilitas data diatur ERP, bukan cuma mobile.
async function sessionRequest(path, body) {
  if (!BASE_URL) {
    throw new ERPNextError("Konfigurasi ERPNext belum lengkap di build ini (URL server kosong). Hubungi admin.");
  }
  const formBody = new URLSearchParams(body || {}).toString();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    credentials: "include",
    body: formBody,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    json = null;
  }
  if (!res.ok) {
    throw new ERPNextError(parseErrorMessage(json, text));
  }
  if (json === null) {
    // Status OK tapi body bukan JSON valid — biasanya tandanya sesi/cookie tidak benar-benar
    // tersambung (server balas halaman HTML, bukan API), umum terjadi saat ditest di web browser
    // karena pembatasan cookie lintas-domain. Di HP (Expo Go) seharusnya tidak kena ini.
    throw new ERPNextError("Sesi tidak tersambung dengan benar ke server (dapat respons bukan JSON). Coba lagi lewat aplikasi HP.");
  }
  return json;
}

export async function erpLogin(usr, pwd) {
  return sessionRequest("/api/method/login", { usr, pwd });
}

export async function erpGenerateApiKeys(usr) {
  const json = await sessionRequest("/api/method/frappe.core.doctype.user.user.generate_keys", { user: usr });
  return json.message; // { api_secret: "..." }
}

export async function erpGetOwnApiKey(usr) {
  const res = await fetch(`${BASE_URL}/api/resource/User/${encodeURIComponent(usr)}?fields=${encodeURIComponent('["api_key"]')}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    json = null;
  }
  if (!res.ok) {
    throw new ERPNextError(parseErrorMessage(json, text));
  }
  if (json === null) {
    throw new ERPNextError("Sesi tidak tersambung dengan benar ke server (dapat respons bukan JSON). Coba lagi lewat aplikasi HP.");
  }
  return json.data ? json.data.api_key : null;
}
