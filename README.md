# 深淵的探索者 維基

《深淵的探索者 Ver.4.0》（D&D 5E 改版、無職業無等級、以 DP 購點）的網頁維基。

## 內容

- **總覽**：創角流程、能力分支的生命值／魔力成長、熟練加值表、整理備註（原文疑似筆誤）
- **角色創造**：靈魂初始資源、肉體原則、七種起源
- **規則**：靈魂池與死亡、大成功效應、休憩點與旅行、傳送門、語言、裝備詞綴、法術與魔力、禁用法術
- **能力目錄**：主規則書 1055 個能力（通用 159、武力 176、靈敏 97、魔法 217、特殊 406）＋四大勢力 40 個專屬能力，可搜尋、依分支／價格／來源篩選；每個能力顯示先決條件與「以此為前置的後續能力」
- **精通能力**：43 種 Specialist
- **四大勢力**：天理聖堂、帝國鐵刃軍、奧秘之理、暗影黑翼（關係、加入條件、特性、專屬能力、商店、法術改造）
- **購點規劃**：選能力即時計算剩餘 DP、能力數、熟練加值、生命值、魔力，並檢查先決條件與勢力限制，可複製角色摘要

## 資料來源

`tools/source/core-rulebook.txt` 的前半（到【魔法】千面相）來自 Google Drive 的文字匯出，
之後的魔法類與特殊類能力由 PDF 以 `pdftotext` 抽出，再用 `tools/merge_pdf_text.py` 整理接上。
PDF 抽字偶爾會讓清單項目的順序或縮排錯位，發現時直接修改來源文字後重新建置即可。

## 使用

直接用瀏覽器開啟 `index.html` 即可（單一檔案，可離線使用；字型需連網）。
也可以在 GitHub 的 Settings → Pages 選擇此分支的根目錄，發佈成網站。

## 建置

```sh
python3 tools/merge_pdf_text.py p1.txt p2.txt  # （僅在重新匯入 PDF 時）接上 PDF 文字
python3 tools/build_data.py   # tools/source/core-rulebook.txt → data/core.js
python3 tools/build_site.py   # src/ + data/ + assets/ → index.html
```

| 路徑 | 說明 |
| --- | --- |
| `tools/source/core-rulebook.txt` | 主規則書文字（由 PDF 匯出） |
| `data/core.js` | 自動產生的能力與精通能力資料 |
| `data/factions.js` | 四大勢力資料（手動整理自勢力 PDF） |
| `src/` | 頁面樣板、樣式與程式 |
| `assets/emblems/` | 勢力徽章 |
