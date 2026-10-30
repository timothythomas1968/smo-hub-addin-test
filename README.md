# Loading the SMO Hub add-in into Excel (test build)

The test build is served from GitHub Pages:

- Manifest: https://timothythomas1968.github.io/smo-hub-addin-test/manifest.xml
- Browser preview (demo data, no Excel needed): https://timothythomas1968.github.io/smo-hub-addin-test/taskpane.html

Use the demo workbook **SMO Hub (UK) v0.10 Complete DEMO.xlsx**. The add-in reads and writes whichever SMO Hub workbook is open.

First, download `manifest.xml` from the link above (right-click, Save link as).

## Mac (Excel for Microsoft 365)

1. Quit Excel.
2. In Finder, choose **Go → Go to Folder…** and paste
   `~/Library/Containers/com.microsoft.Excel/Data/Documents/`
3. If there is no folder called `wef` there, create it. Copy `manifest.xml` into `wef`.
4. Open Excel and the demo workbook.
5. On the **Home** tab, click **SMO Hub (test)** at the right-hand end of the ribbon.
   If it isn't there: **Home → Add-ins** (or **Insert → My Add-ins**), and pick SMO Hub (test) under Developer add-ins.
6. Drag the panel's left edge to make it as wide as you like.

## Windows (Excel for Microsoft 365)

**Option A: upload (quickest, needs a work or school Microsoft 365 account)**

1. Open the demo workbook.
2. **Home → Add-ins → More Add-ins → My Add-ins → Upload My Add-in**.
3. Browse to `manifest.xml` and click **Upload**.
4. Click **SMO Hub (test)** on the Home tab.

**Option B: shared-folder catalogue (works with any account)**

1. Make a folder, for example `C:\SMOHubAddin`, and copy `manifest.xml` into it.
2. Right-click the folder → **Properties → Sharing → Share…** → share it with yourself. Note the network path shown, e.g. `\\YOUR-PC\SMOHubAddin`.
3. In Excel: **File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs**.
4. Paste the network path into **Catalog Url**, click **Add catalog**, tick **Show in Menu**, click **OK** twice.
5. Close and reopen Excel. Open the demo workbook.
6. **Home → Add-ins → More Add-ins → SHARED FOLDER**, pick **SMO Hub (test)**, click **Add**.

## Excel on the web

**Home → Add-ins → More Add-ins → My Add-ins → Upload My Add-in**, choose `manifest.xml`.

## Getting a new build

The screens load from GitHub Pages each time, so a new build normally appears when you close and reopen the panel. If you still see the old one, clear the Office add-in cache:

- Mac: quit Excel, delete the contents of `~/Library/Containers/com.microsoft.Excel/Data/Library/Caches/` and `~/Library/Containers/com.microsoft.Excel/Data/Library/Application Support/Microsoft/Office/16.0/Wef/`
- Windows: quit Excel, delete the contents of `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\`

You only need a new manifest when the ribbon button or permissions change; I'll tell you when.

## What works in this build (0.1.0)

- **Home**: tiles, this month's checklist (ticks are saved inside the workbook), workstream status with trend, coming up in 30 days, milestones, Day 1 and first 100 days.
- **TSA register**: search, filters, and a details panel that edits the register row.
- **RAID and actions**: one list for risks, issues, decisions, assumptions and dependencies, and actions; adopt or remove suggested items; edit and add items.
- Every change is written straight into the workbook cell. Suggested (grey italic) values are only overwritten when you change them.
- The other screens show "SOON" and offer a button that opens their worksheet.
