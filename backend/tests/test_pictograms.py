from base64 import b64decode
from copy import deepcopy

import pytest

library_path = "/api/admin/pictograms"
import_path = f"{library_path}/import"
png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/4sAAAAASUVORK5CYII="


@pytest.fixture
def bundle():
    return {
        "version": 1,
        "title": "Навигация",
        "pictograms": [{
            "title": "Остановка",
            "category": "Транспорт",
            "aliases": ["автобус"],
            "image": {"mime_type": "image/png", "base64": png},
        }],
    }


async def test_import_requires_staff(client, bundle):
    assert (await client.post(import_path, json=bundle)).status_code == 401


async def test_import_persists_metadata_separately_from_image(admin, bundle):
    created = await admin.post(import_path, json=bundle)
    assert created.status_code == 201
    new_set = created.json()["set"]
    pictogram, = created.json()["pictograms"]
    assert pictogram["aliases"] == ["автобус"]
    library = (await admin.get(library_path)).json()
    assert new_set in library["sets"]
    assert pictogram in library["pictograms"]
    assert "base64" not in pictogram
    assert library["selection"]["set_id"] == "kolibri-all"

    repeated = await admin.post(import_path, json=bundle)
    assert repeated.status_code == 200
    assert repeated.json() == created.json()
    changed = deepcopy(bundle)
    changed["pictograms"][0]["title"] = "Переход"
    assert (await admin.post(import_path, json=changed)).status_code == 409

    selection = {"set_id": new_set["id"], "pictogram_ids": new_set["pictogram_ids"]}
    assert (await admin.put(library_path, json=selection)).status_code == 200
    assert (await admin.get(library_path)).json()["selection"] == selection

    del admin.headers["Authorization"]
    image = await admin.get(pictogram["url"])
    assert image.content == b64decode(png)
    assert image.headers["content-type"] == "image/png"
    assert "immutable" in image.headers["cache-control"]


async def test_import_rejects_invalid_image_without_creating_set(admin, bundle):
    bundle["pictograms"].append({
        "title": "Неверный формат",
        "image": {"mime_type": "image/png", "base64": "dGVzdA=="},
    })
    assert (await admin.post(import_path, json=bundle)).status_code == 422
    library = (await admin.get(library_path)).json()
    assert all(row["title"] != bundle["title"] for row in library["sets"])


async def test_library_is_revalidated_by_etag(admin, bundle):
    first = await admin.get(library_path)
    etag = first.headers["etag"]
    assert first.headers["cache-control"] == "private, no-cache"

    unchanged = await admin.get(library_path, headers={"If-None-Match": etag})
    assert unchanged.status_code == 304
    assert not unchanged.content

    assert (await admin.post(import_path, json=bundle)).status_code < 300
    changed = await admin.get(library_path, headers={"If-None-Match": etag})
    assert changed.status_code == 200
    assert changed.headers["etag"] != etag


async def test_light_scope_skips_arasaac_until_it_is_selected(admin):
    full = (await admin.get(library_path)).json()
    light = (await admin.get(library_path, params={"scope": "light"})).json()
    assert light["partial"] is True
    assert not any(p["id"].startswith("arasaac-") for p in light["pictograms"])
    assert [s["id"] for s in light["sets"]] == [s["id"] for s in full["sets"]]
    arasaac = next(s for s in full["sets"] if s["id"] == "arasaac-all")
    assert next(s for s in light["sets"] if s["id"] == "arasaac-all")["pictogram_ids"] == []

    selection = {"set_id": "arasaac-all", "pictogram_ids": arasaac["pictogram_ids"][:2]}
    assert (await admin.put(library_path, json=selection)).status_code == 200
    light = (await admin.get(library_path, params={"scope": "light"})).json()
    assert light["partial"] is False
    assert len(light["pictograms"]) == len(full["pictograms"])


async def test_selected_scope_returns_only_chosen_pictograms(admin):
    full = (await admin.get(library_path)).json()
    chosen = full["selection"]["pictogram_ids"][:3]
    selection = {"set_id": full["selection"]["set_id"], "pictogram_ids": chosen}
    assert (await admin.put(library_path, json=selection)).status_code == 200

    selected = (await admin.get(library_path, params={"scope": "selected"})).json()
    assert sorted(p["id"] for p in selected["pictograms"]) == sorted(chosen)
    assert selected["selection"] == selection
