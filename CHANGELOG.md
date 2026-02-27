# Changelog

## [0.3.0](https://github.com/verana-labs/verana-resolver/compare/v0.2.0...v0.3.0) (2026-02-27)


### Features

* add TRUST_TTL_REFRESH_RATIO to trigger re-evaluation before expiration ([#122](https://github.com/verana-labs/verana-resolver/issues/122)) ([e50d5dd](https://github.com/verana-labs/verana-resolver/commit/e50d5ddd629667c967b3e72a02ffa64327acfb4b))
* implement ECS schema digest verification using JCS canonicalization ([#116](https://github.com/verana-labs/verana-resolver/issues/116)) ([8790325](https://github.com/verana-labs/verana-resolver/commit/8790325bdbc494bedc3a8b3d9a028632487a1c57))


### Bug Fixes

* deduplicate VP endpoints and handle duplicate credential inserts ([#117](https://github.com/verana-labs/verana-resolver/issues/117)) ([9d6f3f2](https://github.com/verana-labs/verana-resolver/commit/9d6f3f241f19cc1aecca03e38708f09a65a4d96f))
* remove validUntil cache expiry check causing infinite DID re-resolution ([#120](https://github.com/verana-labs/verana-resolver/issues/120)) ([2153e7f](https://github.com/verana-labs/verana-resolver/commit/2153e7f79d086513133618dae7285c1c36c44a69))
* separate VP dereference errors from failedCredentials ([#119](https://github.com/verana-labs/verana-resolver/issues/119)) ([52564d2](https://github.com/verana-labs/verana-resolver/commit/52564d279b1ce617f3ba08acb8c88563ce3d5512))


### Performance Improvements

* optimize Indexer API calls in credential evaluation ([#121](https://github.com/verana-labs/verana-resolver/issues/121)) ([d69c7ad](https://github.com/verana-labs/verana-resolver/commit/d69c7ad59b915a1f417ec3570478f8dd7414d8b7))

## [0.2.0](https://github.com/verana-labs/verana-resolver/compare/v0.1.0...v0.2.0) (2026-02-15)


### ⚠ BREAKING CHANGES

* DATABASE_URL replaced by POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB. VPR_ALLOWLIST_PATH removed — use INDEXER_API for indexer URL and ECS_ECOSYSTEM_DIDS for allowed ecosystem DIDs.

### Features

* add dev-mode POST /v1/inject/did endpoint ([#84](https://github.com/verana-labs/verana-resolver/issues/84)) ([d61bb5e](https://github.com/verana-labs/verana-resolver/commit/d61bb5ee500928dc1facc80c1d11c0bb1a808d73)), closes [#82](https://github.com/verana-labs/verana-resolver/issues/82)
* add DISABLE_DIGEST_SRI_VERIFICATION env variable ([#113](https://github.com/verana-labs/verana-resolver/issues/113)) ([34f80d7](https://github.com/verana-labs/verana-resolver/commit/34f80d79648cefbd724d76c88921ba220654909c)), closes [#112](https://github.com/verana-labs/verana-resolver/issues/112)
* add docker-compose for local dev (PostgreSQL + Redis) ([#69](https://github.com/verana-labs/verana-resolver/issues/69)) ([9ff31f3](https://github.com/verana-labs/verana-resolver/commit/9ff31f3a22b925c53cd50edbbf3806572d5174fe)), closes [#68](https://github.com/verana-labs/verana-resolver/issues/68)
* add ENABLE_POLLING env var to enable/disable polling at launch ([#83](https://github.com/verana-labs/verana-resolver/issues/83)) ([756a34c](https://github.com/verana-labs/verana-resolver/commit/756a34ccab73c25bd88babc8ffe7447e332441a7)), closes [#81](https://github.com/verana-labs/verana-resolver/issues/81)
* add health/readiness endpoints and Prometheus metrics ([#56](https://github.com/verana-labs/verana-resolver/issues/56)) ([1cd47e7](https://github.com/verana-labs/verana-resolver/commit/1cd47e7e855b0dfac02a582ebc9853e5b184a793))
* add OpenAPI spec and Swagger UI at /docs ([#88](https://github.com/verana-labs/verana-resolver/issues/88)) ([efcb6ed](https://github.com/verana-labs/verana-resolver/commit/efcb6ed5a41440482531cf627a7622bd302ab42e)), closes [#87](https://github.com/verana-labs/verana-resolver/issues/87)
* add polling loop with Pass1/Pass2, leader election, TTL refresh ([#37](https://github.com/verana-labs/verana-resolver/issues/37)) ([5c27f0b](https://github.com/verana-labs/verana-resolver/commit/5c27f0b5f3015f26cdb601b13e0a8fc4abbe34f9)), closes [#19](https://github.com/verana-labs/verana-resolver/issues/19)
* add Q1 REST endpoint GET /v1/trust/resolve ([#36](https://github.com/verana-labs/verana-resolver/issues/36)) ([131ab72](https://github.com/verana-labs/verana-resolver/commit/131ab72f7569119f0d50231dc9fb28a0ac752f65)), closes [#18](https://github.com/verana-labs/verana-resolver/issues/18)
* add Q2 endpoint GET /v1/trust/issuer-authorization ([#39](https://github.com/verana-labs/verana-resolver/issues/39)) ([410bc9b](https://github.com/verana-labs/verana-resolver/commit/410bc9b505ec2f014c0d38363a4d196b64c80eff)), closes [#20](https://github.com/verana-labs/verana-resolver/issues/20)
* add Q3 endpoint GET /v1/trust/verifier-authorization ([#40](https://github.com/verana-labs/verana-resolver/issues/40)) ([31451e4](https://github.com/verana-labs/verana-resolver/commit/31451e4b6f8121197d5de56575f1ef68aade2eee)), closes [#21](https://github.com/verana-labs/verana-resolver/issues/21)
* add Q4 endpoint GET /v1/trust/ecosystem-participant ([#41](https://github.com/verana-labs/verana-resolver/issues/41)) ([87fce27](https://github.com/verana-labs/verana-resolver/commit/87fce2745bb417a1184f33ef72f2e238e9facee9)), closes [#22](https://github.com/verana-labs/verana-resolver/issues/22)
* add verbose debug logging for VP/VC summaries and credential failure details ([#101](https://github.com/verana-labs/verana-resolver/issues/101)) ([ed47b7a](https://github.com/verana-labs/verana-resolver/commit/ed47b7a19afb7905a4adafca0cd51aab1011a572))
* add verbose debug/info logging to pass1, pass2, and trust evaluation ([#90](https://github.com/verana-labs/verana-resolver/issues/90)) ([c8ff651](https://github.com/verana-labs/verana-resolver/commit/c8ff65196e0bbdd988731a6d18e8b486f2e36b52)), closes [#89](https://github.com/verana-labs/verana-resolver/issues/89)
* aligned fields ([#7](https://github.com/verana-labs/verana-resolver/issues/7)) ([e0dc074](https://github.com/verana-labs/verana-resolver/commit/e0dc074f96844d26fa6a26301e73df601b2f1199))
* DID resolution + VP/VC dereferencing ([#16](https://github.com/verana-labs/verana-resolver/issues/16)) ([#33](https://github.com/verana-labs/verana-resolver/issues/33)) ([22eabe1](https://github.com/verana-labs/verana-resolver/commit/22eabe1a267ae440a893945768697093476c8151))
* implement resolveTrust algorithm (Q1 core) ([#35](https://github.com/verana-labs/verana-resolver/issues/35)) ([7b2b0ce](https://github.com/verana-labs/verana-resolver/commit/7b2b0ceef97ef675f1f2bc46b0f9630547e6ff66)), closes [#17](https://github.com/verana-labs/verana-resolver/issues/17)
* implement W3C VC verification and wire up full startup sequence ([#65](https://github.com/verana-labs/verana-resolver/issues/65)) ([4dd39dc](https://github.com/verana-labs/verana-resolver/commit/4dd39dcf6ec1c60f449f81a24727051eaf21d29a)), closes [#64](https://github.com/verana-labs/verana-resolver/issues/64)
* improve and simplified spec plus implementation plan ([1fc0ad6](https://github.com/verana-labs/verana-resolver/commit/1fc0ad6384382b2fb01141eabd9a02c65b6e1b20))
* improve and simplified spec plus implementation plan ([c916a8a](https://github.com/verana-labs/verana-resolver/commit/c916a8ad6e1a30a75754c24e3501c74aa3c6cdb8))
* improve and simplified spec plus implementation plan ([2933523](https://github.com/verana-labs/verana-resolver/commit/2933523f934c308b38d7d07218753ca256b589f4))
* improve and simplified spec plus implementation plan ([c699721](https://github.com/verana-labs/verana-resolver/commit/c6997218633a071b3e2b20a356996417b4f99371))
* improve and simplified spec plus implementation plan ([7203312](https://github.com/verana-labs/verana-resolver/commit/72033128322d3e07a45f986026264e931747b65a))
* improve and simplified spec plus implementation plan ([142379d](https://github.com/verana-labs/verana-resolver/commit/142379d5c7277ee67c8c590c214391b3378a663c))
* improve and simplified spec plus implementation plan ([#5](https://github.com/verana-labs/verana-resolver/issues/5)) ([6446ef1](https://github.com/verana-labs/verana-resolver/commit/6446ef1728a3506c4f8e02a74c23e74fb4ff3858))
* Indexer client — typed HTTP wrapper for all endpoints ([#15](https://github.com/verana-labs/verana-resolver/issues/15)) ([#31](https://github.com/verana-labs/verana-resolver/issues/31)) ([8ffe0d3](https://github.com/verana-labs/verana-resolver/commit/8ffe0d35dc62cd4b01846486f37f7f2e8e680f24))
* log every processed block with activity summary at info level ([#80](https://github.com/verana-labs/verana-resolver/issues/80)) ([8a4826f](https://github.com/verana-labs/verana-resolver/commit/8a4826f3e89e5a0953f0581dd9a52f02cc30b2a8)), closes [#79](https://github.com/verana-labs/verana-resolver/issues/79)
* PostgreSQL schema + migrations + DB client ([#13](https://github.com/verana-labs/verana-resolver/issues/13)) ([#29](https://github.com/verana-labs/verana-resolver/issues/29)) ([6d74d07](https://github.com/verana-labs/verana-resolver/commit/6d74d0771ccd086df3fadb2b669157bdf25ee371))
* project bootstrap + configuration ([#12](https://github.com/verana-labs/verana-resolver/issues/12)) ([#28](https://github.com/verana-labs/verana-resolver/issues/28)) ([a0b43a3](https://github.com/verana-labs/verana-resolver/commit/a0b43a34d8ca2ea204392b7261227335566b4871))
* Redis client + downloaded file cache ([#14](https://github.com/verana-labs/verana-resolver/issues/14)) ([#30](https://github.com/verana-labs/verana-resolver/issues/30)) ([7dec2cf](https://github.com/verana-labs/verana-resolver/commit/7dec2cfe1fac7d42cad9c751827979dc6c36fceb))
* replace DATABASE_URL with POSTGRES_* vars, add INDEXER_API and ECS_ECOSYSTEM_DIDS ([#59](https://github.com/verana-labs/verana-resolver/issues/59)) ([6337d91](https://github.com/verana-labs/verana-resolver/commit/6337d918b94ed7a8ac89442e62dd20940d4c7301))
* replace polling sleep with Indexer WebSocket block-processed notifications ([#72](https://github.com/verana-labs/verana-resolver/issues/72)) ([09a76ac](https://github.com/verana-labs/verana-resolver/commit/09a76acee1acbe275679141c7d2f25a324b3da82)), closes [#67](https://github.com/verana-labs/verana-resolver/issues/67)
* retry subsystem — permanent error classification, markUntrusted, cleanup marks UNTRUSTED ([#42](https://github.com/verana-labs/verana-resolver/issues/42)) ([6397346](https://github.com/verana-labs/verana-resolver/commit/63973469c72746c93f7fda2df51079c64ae28b89)), closes [#23](https://github.com/verana-labs/verana-resolver/issues/23)
* spec upgrades ([ba83142](https://github.com/verana-labs/verana-resolver/commit/ba831422f78aa95bf50f3d48b8aa5e5e3cc5c5ae))
* switch DID resolution to DIF reference libraries ([#98](https://github.com/verana-labs/verana-resolver/issues/98)) ([046da74](https://github.com/verana-labs/verana-resolver/commit/046da74e282a766d93325af9d9e0bd3eceb5081d)), closes [#97](https://github.com/verana-labs/verana-resolver/issues/97)
* testing ([7092f30](https://github.com/verana-labs/verana-resolver/commit/7092f30f3d478f1fd07ca422edd8a6d58a2d7f42))
* testing ([3f1e62a](https://github.com/verana-labs/verana-resolver/commit/3f1e62ac0c6a88c51f7c8c8842cd60a1e2786951))
* updated impl plan ([#32](https://github.com/verana-labs/verana-resolver/issues/32)) ([5239570](https://github.com/verana-labs/verana-resolver/commit/523957057b9c4fd49b12a3b9166d70bd179923f3))
* updated specs ([ba83142](https://github.com/verana-labs/verana-resolver/commit/ba831422f78aa95bf50f3d48b8aa5e5e3cc5c5ae))
* updated specs ([cbada76](https://github.com/verana-labs/verana-resolver/commit/cbada7669cdacc771cbdec98f998f6ac111f90d7))


### Bug Fixes

* add dotenv to load .env file into process.env before config parsing ([#74](https://github.com/verana-labs/verana-resolver/issues/74)) ([2c92647](https://github.com/verana-labs/verana-resolver/commit/2c926475b8bc1ca5bc3f8f14ab44a8a9cd211ff2)), closes [#73](https://github.com/verana-labs/verana-resolver/issues/73)
* add missing Helm chart dependencies, PVCs, and StatefulSet ([#61](https://github.com/verana-labs/verana-resolver/issues/61)) ([410e26b](https://github.com/verana-labs/verana-resolver/commit/410e26bc3bbc5e80d6425f5ab0366a886e5f91f0)), closes [#55](https://github.com/verana-labs/verana-resolver/issues/55)
* align indexer response types with actual API + search schemas by $id ([#110](https://github.com/verana-labs/verana-resolver/issues/110)) ([696d6d0](https://github.com/verana-labs/verana-resolver/commit/696d6d09a2f3082c50ba62c2c6a3a9a0e07a7023))
* aligned fields ([#8](https://github.com/verana-labs/verana-resolver/issues/8)) ([50e6df5](https://github.com/verana-labs/verana-resolver/commit/50e6df526c5738534b5a406a3ad6e478910615a8))
* Credo-ts ^0.6.2, remove askar, fix TS compilation errors ([#34](https://github.com/verana-labs/verana-resolver/issues/34)) ([6093251](https://github.com/verana-labs/verana-resolver/commit/6093251eb5de97839e9974bb8414555827e7d11c))
* dereference VTJSC URLs for regular VCs and verify digestSRI ([#108](https://github.com/verana-labs/verana-resolver/issues/108)) ([8dadffe](https://github.com/verana-labs/verana-resolver/commit/8dadffe86aef381a123ed44e2339bcc820438d89))
* detect VTJSCs by type, extract schema ref from credentialSubject.id ([#109](https://github.com/verana-labs/verana-resolver/issues/109)) ([57156f0](https://github.com/verana-labs/verana-resolver/commit/57156f0d0b0c99b7e1f45f6d318e8e44ac0ed28d))
* disable jsonld safe mode and add context caching ([#105](https://github.com/verana-labs/verana-resolver/issues/105)) ([929f249](https://github.com/verana-labs/verana-resolver/commit/929f249f0bcc0b78f79906bb8c8cba74a84d970d))
* filter VS-REQ credentials by ECS_ECOSYSTEM_DIDS allowlist ([#63](https://github.com/verana-labs/verana-resolver/issues/63)) ([ef9594f](https://github.com/verana-labs/verana-resolver/commit/ef9594f62404a5977e391787f20e8f57cc1e6881)), closes [#62](https://github.com/verana-labs/verana-resolver/issues/62)
* include human-readable message in DID resolution error logs ([#94](https://github.com/verana-labs/verana-resolver/issues/94)) ([2b43a9f](https://github.com/verana-labs/verana-resolver/commit/2b43a9f86053b32ede89021c489fdef7650e78eb)), closes [#93](https://github.com/verana-labs/verana-resolver/issues/93)
* make ECS_ECOSYSTEM_DIDS required (needed for Q1 trust evaluation) ([#60](https://github.com/verana-labs/verana-resolver/issues/60)) ([9a1b130](https://github.com/verana-labs/verana-resolver/commit/9a1b130905f5fa2bb7789dc1fd6275511cea52f7))
* provide Ed25519 verifier to didwebvh-ts for DID log signature verification ([#100](https://github.com/verana-labs/verana-resolver/issues/100)) ([f73c78d](https://github.com/verana-labs/verana-resolver/commit/f73c78d065b2276a074311651e5aaed4765f1c24))
* register did:webvh resolver in Credo agent for signature verification ([#103](https://github.com/verana-labs/verana-resolver/issues/103)) ([c2461f4](https://github.com/verana-labs/verana-resolver/commit/c2461f4c0a27f631d905e980cafc703477ccbc92))
* register DrizzleStorageModule to provide Credo StorageService ([#76](https://github.com/verana-labs/verana-resolver/issues/76)) ([8d26f14](https://github.com/verana-labs/verana-resolver/commit/8d26f14b16f1001b6e94d0174d339ea82917c042)), closes [#75](https://github.com/verana-labs/verana-resolver/issues/75)
* register WebVhDidResolver in Credo DidsModule ([#92](https://github.com/verana-labs/verana-resolver/issues/92)) ([1e8fc59](https://github.com/verana-labs/verana-resolver/commit/1e8fc596d170f5ca2c28e291b147bca2659b18ed)), closes [#91](https://github.com/verana-labs/verana-resolver/issues/91)
* remove Credo-ts, implement direct Ed25519/JWT credential verification ([#104](https://github.com/verana-labs/verana-resolver/issues/104)) ([479871c](https://github.com/verana-labs/verana-resolver/commit/479871c07a89ec00de66991bf595da09a1fe4128))
* remove NOW() from partial index predicate in initial schema ([#78](https://github.com/verana-labs/verana-resolver/issues/78)) ([f8c08ad](https://github.com/verana-labs/verana-resolver/commit/f8c08ad8df5d486effe35aebd8207b2e64183658)), closes [#77](https://github.com/verana-labs/verana-resolver/issues/77)
* replace z.coerce.boolean() with custom booleanFromEnv parser ([#86](https://github.com/verana-labs/verana-resolver/issues/86)) ([4ab9ed9](https://github.com/verana-labs/verana-resolver/commit/4ab9ed98e34acfa6e788b666d17eb07d8b2b612a)), closes [#85](https://github.com/verana-labs/verana-resolver/issues/85)
* resolve merge conflict markers in CI/CD workflow files ([#54](https://github.com/verana-labs/verana-resolver/issues/54)) ([3ccccd9](https://github.com/verana-labs/verana-resolver/commit/3ccccd90eace119f845ddc52f218ca1dc3fa8d67))
* resolve VPR URIs for schema lookup and improve credential evaluation logging ([#107](https://github.com/verana-labs/verana-resolver/issues/107)) ([92abaf7](https://github.com/verana-labs/verana-resolver/commit/92abaf70c7bf6ee35fc0d60d27640fb07bf783de))
* revert to DrizzleStorageModule — askar-nodejs@0.6.0 runtime-incompatible with @credo-ts/askar@0.6.2 ([#99](https://github.com/verana-labs/verana-resolver/issues/99)) ([c81e2a9](https://github.com/verana-labs/verana-resolver/commit/c81e2a9d7caa533d1d5e686b5be8282ae227560e))
* standalone pino loggers now respect LOG_LEVEL env var ([#102](https://github.com/verana-labs/verana-resolver/issues/102)) ([cefa71b](https://github.com/verana-labs/verana-resolver/commit/cefa71bc50e476abe9704294c79405da4bee8caa))
* use default jsonld document loader for canonicalization ([#106](https://github.com/verana-labs/verana-resolver/issues/106)) ([e77b516](https://github.com/verana-labs/verana-resolver/commit/e77b516d045b87640a48a30c0c3f337e22c5d5df))
* use npm install instead of npm ci (no package-lock.json in repo yet) ([#50](https://github.com/verana-labs/verana-resolver/issues/50)) ([b5864f8](https://github.com/verana-labs/verana-resolver/commit/b5864f8784726688b330469777bdd22223c94c90))
