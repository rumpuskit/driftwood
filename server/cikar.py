#!/usr/bin/env python3
"""Adadan çıkmak isteyeni (DM ile bildirir) hemen çıkarır ve bir daha taşınmamasını sağlar.

Kullanım:
    python3 cikar.py kullaniciadi
    python3 cikar.py --geri-al kullaniciadi     # fikrini değiştirirse: sonraki aktarımda yeniden taşınır
    python3 cikar.py --gizle kullaniciadi       # adada kalır, adı görünmez ("gizli komşu")
    python3 cikar.py --goster kullaniciadi      # adı yeniden görünür

Kullanıcı adının kendisi saklanmaz; çıkma listesinde yalnız sha256 özeti durur.
"""

import argparse
import json
import time

from driftwood_sim import sim
from ortak import DB, opt_out_hash, psql, publish

PLATFORM = "tt"  # sakinler yalnız TikTok takipçilerinden


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("handle")
    parser.add_argument("--geri-al", action="store_true")
    parser.add_argument("--gizle", action="store_true")
    parser.add_argument("--goster", action="store_true")
    parser.add_argument("--db", default=DB)
    args = parser.parse_args()

    handle = sim.normalize_handle(args.handle)
    ozet = opt_out_hash(PLATFORM, handle)
    if args.gizle or args.goster:
        n = psql("WITH d AS (UPDATE sakinler SET hidden = :hid WHERE platform = :'pf' AND handle = :'h' RETURNING 1) SELECT count(*) FROM d",
                 args.db, ["-v", f"pf={PLATFORM}", "-v", f"h={handle}", "-v", f"hid={'true' if args.gizle else 'false'}"])
        if n != "1":
            raise SystemExit(f"HATA: @{handle} adada değil")
        print(json.dumps({"gizli" if args.gizle else "gorunur": handle, "yayin": publish(args.db)}, ensure_ascii=False))
        return
    if args.geri_al:
        psql(f"DELETE FROM cikanlar WHERE ozet = '{ozet}'", args.db)
        print(json.dumps({"geri_alindi": handle}, ensure_ascii=False))
        return
    day = sim.day_of(time.time())
    removed = psql(f"""
        INSERT INTO cikanlar (ozet, day) VALUES ('{ozet}', {day}) ON CONFLICT DO NOTHING;
        DELETE FROM istekler WHERE handle = :'h';
        WITH d AS (DELETE FROM sakinler WHERE platform = :'pf' AND handle = :'h' RETURNING 1) SELECT count(*) FROM d;
    """, args.db, ["-v", f"pf={PLATFORM}", "-v", f"h={handle}"])
    # Sitedeki tercihleri, oturumu ve oyları da (Worker).
    from ortak import kayit
    kayit("POST", "/api/sil", {"handles": [handle]})
    print(json.dumps({"cikarildi": handle, "kayit_silindi": removed == "1", "yayin": publish(args.db)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
