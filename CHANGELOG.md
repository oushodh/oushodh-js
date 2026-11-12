# Changelog

## 0.1.0 (unreleased)

- First version of the SDK for the Oushodh API `/v1`.
- `Oushodh` client: `meta()`, `listMedicines()`, `medicines()` (pages to the end with `for await`), `search()`, `getMedicine()`, `imageUrl()` and `getImage()`.
- Types for every model in the OpenAPI spec: `Medicine`, `MedicineDetail`, `Monograph`, `Page`, `SearchResult` and `Meta`.
- One error class per family, all extending `OushodhError`.
- Retries on `429 rate_limited` (after `Retry-After`), on `5xx` and on network errors.
