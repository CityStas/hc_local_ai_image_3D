# HC AI 3D

Локальный мультимодальный ассистент для Windows: **чат, генерация картинок, зрение,
апскейл, удаление фона и image-to-3D** - всё считается на вашей машине. Без облака,
без API-ключей, без подписок.

`Electron 30` + `React 19` + `node-llama-cpp` + `stable-diffusion.cpp (Vulkan)` +
`llama.cpp (Vulkan)` + `ComfyUI (sidecar)`

Версия без 3D - [CityStas/hc_local_ai_image](https://github.com/CityStas/hc_local_ai_image).
Проект самодостаточен: `npm run download:all` кладёт всё нужное внутрь приложения, и
без единой переменной окружения он работает. Если веса уже лежат в общем каталоге на
диске, приложение подхватит их оттуда - см. [«Модели: где лежат»](#модели-где-лежат).

![Генерация картинки в HC AI](docs/screenshot-2.jpg)

## Требования

|  |  |
| --- | --- |
| ОС | Windows 10/11 x64 |
| Node.js | 20 или новее |
| GPU | с поддержкой Vulkan (NVIDIA / AMD / Intel Arc) |
| VRAM | 8 ГБ: на карте живёт одна тяжёлая модель за раз |
| RAM | 16 ГБ рекомендуется - используется как кэш моделей |
| Диск | ~13 ГБ под модели и движки, ~2 ГБ под `node_modules` и сборку |
| ComfyUI | портативная сборка `ComfyUI-Easy-Install` - только для фона и 3D |

## Быстрый старт

```bash
git clone https://github.com/CityStas/hc_local_ai_image_3D
cd hc_local_ai_image_3D
npm install
npm run download:all      # ~13 ГБ моделей и движков, один раз
npm start
```

`npm start` собирает фронтенд и поднимает Electron. Модель грузится лениво - при
первом сообщении, прогресс виден в интерфейсе.

## Модели: скачать

Скрипты сами кладут файлы туда, где их ищут движки, докачивают с места обрыва
(`Range` + `.part`) и не перекачивают готовое. Качать можно по частям - минимальный
набор для чата это `download:llm`.

| команда | размер | что даёт |
| --- | --- | --- |
| `npm run download:llm` | 507 МБ | Qwen3.5 0.8B - чат и служебная логика |
| `npm run download:zimage` | 6.5 ГБ | Z-Image Turbo: диффузия + VAE + текстовый энкодер |
| `npm run download:vlm-model` | 5.5 ГБ | Qwen2.5-VL 7B + mmproj - зрение |
| `npm run download:vulkan` | 37 МБ | `sd-cli` / `sd-server` (Vulkan) |
| `npm run download:vlm` | 97 МБ | `llama-server` / `llama-mtmd-cli` (Vulkan) |
| `npm run download:esrgan` | 45 МБ | Real-ESRGAN ncnn - апскейл ×4 |
| `npm run download:moondream` | 3.7 ГБ | альтернативная модель зрения |

Источники: [unsloth/Qwen3.5-0.8B-GGUF](https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF),
[leejet/Z-Image-Turbo-GGUF](https://huggingface.co/leejet/Z-Image-Turbo-GGUF),
[Tongyi-MAI/Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) (VAE),
[unsloth/Qwen3-4B-Instruct-2507-GGUF](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF),
[ggml-org/Qwen2.5-VL-7B-Instruct-GGUF](https://huggingface.co/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF),
[ggml-org/moondream2-20250414-GGUF](https://huggingface.co/ggml-org/moondream2-20250414-GGUF),
[leejet/stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp/releases) (`master-829-0a565f2`),
[ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp/releases) (`b10679`),
[xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0).

**Фон и 3D - отдельным шагом.** Нужна портативная сборка `ComfyUI-Easy-Install`
(внутри `python_embeded\python.exe` и `ComfyUI\main.py`), в репозиторий она не входит:

1. положить сборку в `comfy/ComfyUI-Easy-Install/` рядом с приложением **или**
   указать путь: `set HC_COMFY_ROOT=D:\ComfyUI-Easy-Install`;
2. доставить ноды из `workflows/comfy/` (GGUF-загрузчик UNet, birefnet, Trellis2,
   TripoSplat, MoGe, Pixal3D) - ComfyUI сам перечислит отсутствующие при первом запуске;
3. положить модели в `ComfyUI/models/**`: `birefnet.safetensors`,
   `pixal3d_int8_convrot.safetensors`, `trellis_2_shape_vae_bf16.safetensors`,
   `trellis_2_texture_vae_bf16.safetensors`, `dino_v3_L_naf_fp32.safetensors`,
   `moge_2_vitl_normal_fp16.safetensors`, `triposplat_fp16.safetensors`,
   `triposplat_vae_decoder_fp16.safetensors`, `dino_v3_vit_h.safetensors`,
   `flux2-vae.safetensors` (~13 ГБ).

Если эти же веса уже лежат в общем каталоге (например, их положил другой локальный
инструмент), качать второй раз не нужно - достаточно `HC_COMFY_ROOT` и `HC_MODELS_ROOT`
на этот каталог.

## Модели: где лежат

Абсолютных путей в коде нет - буква диска не зашита нигде. **По умолчанию всё, что
качает `npm run download:*`, лежит внутри приложения** - ничего настраивать не нужно,
внешние каталоги это только опция.

| переменная | по умолчанию | что задаёт |
| --- | --- | --- |
| `LOCAL_LLM_MODELS` | пусто | **общий** корень весов на машине; нейтральное имя, его может читать любой локальный инструмент |
| `HC_MODELS_ROOT` | `LOCAL_LLM_MODELS`, иначе ресурсы приложения | корень весов только для HC AI (побеждает общий) |
| `HC_COMFY_ROOT` | `<models>/text_image_3D/3d_gen/3d_comfy/ComfyUI-Easy-Install`, иначе `comfy/` рядом с приложением | сборка ComfyUI |
| `HC_BIN_ROOT` | папка приложения | где искать `sd-server`, `llama-server` |

Общий каталог нужен, только если веса уже лежат где-то на диске и качать их второй раз
незачем. Тогда путь задаётся один раз на машину:

```cmd
setx LOCAL_LLM_MODELS "D:\AI\Models"
```

Если общий корень нужен только этому приложению, путь пишется в `.env` рядом с
`package.json` (файл в git не попадает, образец - `.env.example`):

```cmd
copy .env.example .env
:: затем в .env:
LOCAL_LLM_MODELS=D:\AI\Models
```

Раскладка внутри корня: `image/z-image-turbo/`, `vlm/Qwen2.5-VL-7B/`, `llm/`,
`text_image_3D/` (ComfyUI и его модели), `bin/` (sd-server, llama-server).

Порядок поиска: ресурсы приложения (`node_modules/electron/dist/resources/`, из неё же
`electron-builder` пакует `.exe`) → папки рядом с приложением → внешний корень.
Свои файлы главнее, внешний корень подхватывается, только если своих нет.

## Что умеет

![Интерфейс: чат, галерея вариантов, HUD](docs/screenshot-1.jpg)

- **Чат** - стриминг, история, несколько сессий, персоны. Qwen3.5 0.8B крутится прямо
  в главном процессе Electron через `node-llama-cpp`. Свои GGUF подключаются
  инспектором: архитектура, квант, слои, контекст читаются из заголовка файла.
- **Картинки** - Z-Image Turbo (768×768, euler + `sgm_uniform`, distilled guidance 3.5)
  через `sd-server` на Vulkan. Промпт на русском переводится встроенной LLM. EDIT-режим
  решает, доработать картинку или нарисовать новую; композитинг «продукт → сцена»
  накладывает объект поверх сгенерированного фона пиксельно, с тенью и альфой.
- **Зрение** - Qwen2.5-VL 7B + `mmproj Q8_0`; чипы «Описать», «OCR», «Объекты»,
  «Калории». На 8 ГБ VRAM mmproj уходит на CPU.
- **Апскейл** - Real-ESRGAN ncnn Vulkan ×4 (`realesrgan-x4plus`, `-anime`,
  `realesr-animevideov3`, `realesr-general-x4v3`).
- **Фон и 3D** - ComfyUI-сайдкар на `127.0.0.1:8188`: `birefnet` → PNG с альфой;
  image-to-3D двумя воркфлоу (**Trellis2** - детальнее, **TripoSplat** - быстрее) и
  встроенный просмотрщик GLB. Имя файла берётся из промпта картинки.
- **Галерея вариантов** - под каждой картинкой `Оригинал` / `Без фона` / `×4` / `3D`;
  клик делает вариант активным для остальных инструментов.
- **Арбитраж RAM/VRAM** - тяжёлые соседи гасятся по очереди (`sd-server` ~6.5 ГБ,
  VLM ~5.5 ГБ, ComfyUI), лёгкая LLM ~0.7 ГБ остаётся в VRAM. ComfyUI не переживает
  сессию: pid-файл, авто-стоп по простою, гашение перед каждой генерацией.
- **Префетч** GGUF в page-cache RAM (`prefetch.cjs`) - повторная загрузка идёт из
  памяти; замеры в [`BENCHMARKS.md`](BENCHMARKS.md).
- Полностью офлайн: ни телеметрии, ни аналитики, ни сетевых вызовов.

## Как проверить, что всё встало

```bash
npm start
```

1. В шапке `HC AI`, справа модель `Qwen3.5 0.8B`. Спросите что-нибудь - пойдёт
   стриминг, в HUD появятся tok/s. Нет модели - в ответе будет подсказка про
   `npm run download:llm`.
2. Режим картинок, «кот в шлеме астронавта» - 15-25 с на `sd-server`.
3. Приложите фото, чип **Описать** / **OCR** - включится Vision.
4. **Увеличить ×4** - апскейл.
5. **Убрать фон** - ComfyUI поднимется (первый раз 30-90 с) и вернёт PNG с альфой.
6. **В 3D** - соберёт модель и откроет просмотрщик.

Без GPU с Vulkan приложение запустится, но генерация, зрение и 3D будут непрактично
медленными.

## Сборка .exe

```bash
npm run dist:exe          # портативный: dist/HC-AI-portable.exe
npm run dist:installer    # установщик NSIS: dist/HC-AI-setup.exe
```

Модели из `node_modules/electron/dist/resources/` и воркфлоу из `workflows/` пакуются
в дистрибутив, поэтому папки должны быть на месте **до** сборки. ComfyUI в поставку
не входит - путь задаётся через `HC_COMFY_ROOT`.

## Структура

```
main.cjs            главный процесс: IPC, LLM через node-llama-cpp, оркестрация движков
preload.cjs         contextBridge → window.nexus
modelPaths.cjs      где искать модели и бинарники (env-переопределения, общий корень)
sdEngine.cjs        картинки: sd-server / sd-cli, img2img, арбитраж VRAM
vlmEngine.cjs       зрение: llama-server / llama-mtmd-cli, ретраи, арбитраж VRAM
comfyEngine.cjs     ComfyUI-сайдкар: :8188, воркфлоу, прогресс по WebSocket
upscaleEngine.cjs   Real-ESRGAN ×4
prefetch.cjs        фоновый прогрев GGUF в RAM page-cache
workflows/comfy/    API-воркфлоу ComfyUI + manifest.json
src/                React-интерфейс
scripts/            загрузка моделей, сборка портативной версии, бенчмарки
```

## Лицензии

Код приложения - авторский. Модели под своими лицензиями: Qwen3.5 0.8B и Qwen3-4B -
Apache 2.0, Qwen2.5-VL - Apache 2.0, Z-Image Turbo - см.
[Tongyi-MAI/Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo),
Real-ESRGAN - BSD-3-Clause, `llama.cpp` и `stable-diffusion.cpp` - MIT.
`ComfyUI` - GPL-3.0, запускается отдельным процессом и в поставку не входит.
Перед коммерческим использованием проверьте условия каждой модели.
