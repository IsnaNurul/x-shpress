import * as Network from "expo-network";

// Status konektivitas internet (BUKAN cuma nyambung wifi/seluler -- `isInternetReachable` null
// berarti belum sempat dicek/platform-nya nggak bisa mastiin, dianggap online drpd nge-flash
// banner offline yg salah tiap kali app baru dibuka/network state-nya belum sempat ke-resolve).
function isReachable(state) {
  return state.isInternetReachable !== false;
}

export async function getIsOnline() {
  try {
    const state = await Network.getNetworkStateAsync();
    return isReachable(state);
  } catch (e) {
    return true;
  }
}

// Dengerin perubahan koneksi real-time (native event, BUKAN polling) -- `onChange(online)`
// dipanggil sekali di awal dgn status terkini, lalu tiap kali statusnya berubah.
export function subscribeNetworkStatus(onChange) {
  let stopped = false;
  getIsOnline().then((online) => {
    if (!stopped) onChange(online);
  });
  const subscription = Network.addNetworkStateListener((state) => {
    if (!stopped) onChange(isReachable(state));
  });
  return () => {
    stopped = true;
    subscription.remove();
  };
}
