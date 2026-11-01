// İkili yığın (öncelik kuyruğu): yol bulmada en küçük maliyetli düğümü hızlıca verir.
export class MinHeap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }

  get size() {
    return this.keys.length;
  }

  push(key, val) {
    const k = this.keys, v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  }

  pop() {
    const k = this.keys, v = this.vals;
    const top = v[0], topKey = k[0];
    const lastK = k.pop(), lastV = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      while (true) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lastK;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (r < n && k[r] < mk) { m = r; mk = k[r]; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m];
        i = m;
      }
      k[i] = lastK; v[i] = lastV;
    }
    this.lastKey = topKey;
    return top;
  }
}
