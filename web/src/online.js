// Çevrimiçi sayacı: driftwood-data.rumpuskit.com'daki Worker'a tek bir WebSocket açar, gelen sayıyı sol üstte
// gösterir. Bağlantı koparsa artan aralıklarla yeniden dener; sayaç hiç açılamazsa satır gizli kalır.
import { num as fmtNum } from "./fmt.js";

const URL = "wss://driftwood-data.rumpuskit.com/ws";

export function startOnline() {
  const row = document.getElementById("online"), num = document.getElementById("online-n");
  let ws = null, retry = 2000, ping = null;
  const connect = () => {
    try { ws = new WebSocket(URL); } catch { return; }
    ws.onopen = () => {
      retry = 2000;
      ws.send("p");
      clearInterval(ping);
      ping = setInterval(() => ws?.readyState === 1 && ws.send("p"), 60000);
    };
    ws.onmessage = (e) => {
      const n = Number(e.data);
      if (!Number.isFinite(n) || n < 1) return;
      num.textContent = fmtNum(n);
      row.hidden = false;
    };
    ws.onclose = () => {
      clearInterval(ping);
      row.hidden = true;
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 60000);
    };
  };
  // Sekme arka plandayken bağlantıyı tutmak sayıyı şişirmez: tarayıcı kapatınca bağlantı da kapanır.
  connect();
}
