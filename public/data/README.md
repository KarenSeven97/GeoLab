# Bryant Park 建筑数据摘录

`bryant-park.json` 来自真实 OpenStreetMap 数据，不是人工生成城市。

- 原始请求：`https://api.openstreetmap.org/api/0.6/map.json?bbox=-73.989,40.749,-73.979,40.757`
- 获取日期：2026-10-27，精确获取时间存储于 JSON 的 `fetchedAt`。
- 查询范围：西 -73.989，南 40.749，东 -73.979，北 40.757。
- 处理：osmtogeojson 转换；保留建筑与建筑分段；提取高度、底部高度和推断类别；有分段的外壳不重复拉伸。
- 结果：1,468 个建筑体块；1,418 个标注高度、12 个层数估算、38 个默认估算；8 个不完整几何被跳过。
- OSM API 返回的完整关联对象可能延伸出请求边界，边界表示请求区域而非严格裁剪线。
- 原始标签保留在每个建筑的 `properties.tags`；`properties.id` 可追溯 OSM 原始对象。
- 数据准确性取决于 OSM；层数按 3 米/层估算，默认高度为 9 米。

© OpenStreetMap contributors。数据依据 [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/) 提供；署名和许可说明见 [OSM Copyright](https://www.openstreetmap.org/copyright)。归一化后的数据库亦按 ODbL 提供。应用代码的许可与数据许可分别处理。

重新生成：下载同范围 OSM JSON 为项目外部文件，执行 `node scripts/prepare-snapshot.mjs <原始文件路径>`。不要高频调用 OSM 主 API；正常应用切换区域使用 Overpass，摘录仅用于可复现默认展示。
