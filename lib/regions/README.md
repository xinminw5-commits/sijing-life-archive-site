# 出生地地区数据

`china-pca.json` 来自 [modood/Administrative-divisions-of-China](https://github.com/modood/Administrative-divisions-of-China/blob/master/dist/pca-code.json)，2026-10-05 下载。上游采用 2023 年统计用区划代码，收录 31 个省级地区、3056 个县区条目。许可证保存在本目录 LICENSE。

这是一份用于地点选择的固定快照，不承诺包含最新行政调整或历史地名。港澳台及未收录地点使用手动输入；排盘引擎仍只支持中国标准时，地区代码不用于猜测时区或真太阳时。

更新时替换 JSON，并核对三级层级、直辖市、省直辖县级单位及现有功能检查。结构化代码保留在表单状态中，提交前由 `resolveBirthPlace` 校验完整父子关系并转成兼容 API 的地点字符串。
