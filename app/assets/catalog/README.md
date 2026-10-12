# Original GrailHaus catalog artwork

This set contains 27 individual fictional trading-card illustrations, ten square sneaker/watch catalog illustrations, and eight GrailHaus pack designs (Starter, Scout, Collector, Elite, Legendary, Midnight Drop, plus sneaker and watch packaging). The sneaker and watch illustrations are stylized studio product shots generated for this catalog. They are not photographs of branded retail products, and they include no logos or product text.

Each card illustration is named after its matching seeded collectible. Starter COMMON is Emberkin (`emberkin.jpg`); Scout RARE is Rookwing (`rookwing.jpg`); Collector/Elite LEGENDARY is Auric Crown (`auric-crown.jpg`); Elite/Collector EPIC is Nyxara (`nyxara.jpg`); Legendary pack LEGENDARY is Aurelith Drake (`aurelith-drake.jpg`). Trading-card pack SKUs each have a dedicated sleeve (`pack-card.jpg`, `pack-card-scout.jpg`, `pack-card-collector.jpg`, `pack-card-elite.jpg`, `pack-card-legendary.jpg`, `pack-card-midnight.jpg`). Sneaker and watch SKUs still share their category packaging image; the app displays the tier/name separately. Each of the five seeded sneaker and five seeded watch items has a distinct item illustration.

Mobile copies are recompressed for APK size: shoes/watches up to 768px on the long edge, cards/packs up to 900px, JPEG quality 74 (`python scripts/compress-catalog-art.py`). Runtime uses bundled files and never depends on a developer tool directory.

The static registry is `app/src/components/catalogArtwork.ts`. Shared `CollectibleArt` resolves bundled artwork by catalog item name first (sneaker/watch product JPEGs, never the category pack sleeve), then a remote `image_url` if no bundle match exists, then monogram fallback. Known art is reused in shelf previews, reveal fronts/results/stacks, owned items, and marketplace. Card-back and suspense remain identity-free.

Run `npx tsx scripts/catalog-artwork.ts` to check file coverage, distinct JPEG assets, mobile byte budget, five seeded evergreen tiers per category, and seeded integer expected values. `python scripts/generate-item-art.py` remains a logo-free Pillow fallback for regenerating simple shoe/watch placeholders if needed.

The current bundled set contains forty-five images: 27 card illustrations, 10 sneaker/watch product illustrations, and eight pack designs. Rebuild the Android APK to distribute new local artwork.
