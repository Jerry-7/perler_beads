declare const require: any;

const { readFileSync } = require("fs");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const wxml = readFileSync("miniprogram/pages/index/index.wxml", "utf8");
const pageTs = readFileSync("miniprogram/pages/index/index.ts", "utf8");

test("maker page starts with two feature cards", () => {
  const entryStart = wxml.indexOf("feature-grid");
  const aiCard = wxml.indexOf("openAiTool", entryStart);
  const patternCard = wxml.indexOf("openPatternTool", entryStart);

  assert(entryStart >= 0, "missing feature entry section");
  assert(aiCard > entryStart, "missing AI generation feature card");
  assert(patternCard > aiCard, "missing pattern generation feature card");
});

test("result panel exposes tracing mode controls", () => {
  const panelStart = wxml.indexOf("result-panel");
  const canvas = wxml.indexOf("patternCanvas", panelStart);
  const tracingButton = wxml.indexOf("toggleTracingMode", panelStart);
  const editingButton = wxml.indexOf("toggleEditingMode", panelStart);
  const traceStatus = wxml.indexOf("traceStatusText", panelStart);
  const markSwitch = wxml.indexOf("toggleTraceMarkEnabled", panelStart);
  const editPopover = wxml.indexOf("edit-popover", panelStart);
  const editSearch = wxml.indexOf("onEditSearchInput", panelStart);

  assert(panelStart >= 0, "missing result panel");
  assert(canvas >= 0, "missing pattern canvas");
  assert(tracingButton > panelStart, "result panel should have tracing mode button");
  assert(editingButton > tracingButton, "result panel should have editing mode button");
  assert(traceStatus > panelStart, "tracing mode should show current cell status");
  assert(markSwitch > panelStart, "tracing mode should expose click marking switch");
  assert(editPopover > panelStart, "editing mode should expose color replacement popover");
  assert(editSearch > editPopover, "editing popover should provide bead color search");
});

test("AI generation panel owns AI-only controls", () => {
  const panelStart = wxml.indexOf("activeTool === 'ai'");
  const nextPanel = wxml.indexOf("activeTool === 'pattern'", panelStart);
  const aiPanel = wxml.slice(panelStart, nextPanel);
  const size = wxml.indexOf("onPatternSizeChange", panelStart);
  const customWidth = wxml.indexOf("onWidthInput", size);
  const customHeight = wxml.indexOf("onHeightInput", customWidth);
  const detail = wxml.indexOf("onAiDetailChange", panelStart);
  const style = wxml.indexOf("onAiStyleChange", panelStart);
  const effect = wxml.indexOf("onAiEffect3dChange", panelStart);
  const shading = wxml.indexOf("onAiShadingChange", panelStart);
  const shortcut = wxml.indexOf("useAiImageForPattern", panelStart);

  assert(panelStart >= 0, "missing AI generation panel");
  assert(!aiPanel.includes("onPatternMaxColorsInput"), "AI panel should not expose color count");
  assert(size > panelStart, "AI panel should expose prompt size preset");
  assert(customWidth > size, "AI panel should expose custom width when custom size is selected");
  assert(customHeight > customWidth, "AI panel should expose custom height when custom size is selected");
  assert(detail > customHeight, "AI detail should be after prompt size preset");
  assert(style > detail, "AI style should be in AI panel");
  assert(effect > style, "3D effect should be in AI panel");
  assert(shading > effect, "shading should be in AI panel");
  assert(shortcut > shading, "AI result should provide quick pattern shortcut");
});

test("pattern panel owns upload recommendation and pattern controls", () => {
  const panelStart = wxml.indexOf("activeTool === 'pattern'");
  const upload = wxml.indexOf("chooseImage", panelStart);
  const recommendedSize = wxml.indexOf("recommendedSizeText", panelStart);
  const recommendedColors = wxml.indexOf("recommendedColors", panelStart);
  const applyRecommended = wxml.indexOf("applyRecommendedPatternSize", panelStart);
  const sizeWarning = wxml.indexOf("patternSizeWarning", panelStart);
  const maxColors = wxml.indexOf("onPatternMaxColorsChange", panelStart);
  const sampling = wxml.indexOf("onSamplingModeChange", panelStart);

  assert(panelStart >= 0, "missing pattern generation panel");
  assert(upload > panelStart, "pattern panel should have one upload entry");
  assert(recommendedSize > upload, "pattern panel should show recommended size");
  assert(recommendedColors > recommendedSize, "pattern panel should show recommended color count");
  assert(applyRecommended > recommendedColors, "pattern panel should allow applying recommended size");
  assert(sizeWarning > recommendedColors, "pattern panel should show small-size warning");
  assert(maxColors > recommendedColors, "pattern panel should expose max color count");
  assert(sampling > panelStart, "pattern controls should remain available");
});

test("pattern debug entry is removed from maker flow", () => {
  assert(!wxml.includes("analyzePatternStages"), "debug process button should be removed");
  assert(!pageTs.includes("analyzePatternStages"), "debug process handler should be removed");
});

test("fullscreen editor uses toolbar canvas and bottom palette layout", () => {
  const editorStart = wxml.indexOf("pattern-editor-fullscreen");
  const topbar = wxml.indexOf("editor-topbar", editorStart);
  const toolPanel = wxml.indexOf("editor-tool-panel", editorStart);
  const canvasFrame = wxml.indexOf("editor-canvas-frame", editorStart);
  const colorPanel = wxml.indexOf("editor-color-panel", editorStart);

  assert(editorStart >= 0, "missing fullscreen editor");
  assert(topbar > editorStart, "editor should start with a top toolbar");
  assert(toolPanel > topbar, "editor should expose tools below title bar");
  assert(canvasFrame > toolPanel, "pattern canvas should be in the middle");
  assert(colorPanel > canvasFrame, "color palette should stay at the bottom");
  assert(!wxml.includes("floating-edit-popover"), "editor should not use a floating color popover");
});

test("fullscreen editor uses one directly interactive canvas instead of per-cell DOM nodes", () => {
  const editorStart = wxml.indexOf("pattern-editor-fullscreen");
  const grid = wxml.indexOf("editor-pattern-grid", editorStart);
  const editorCanvas = wxml.indexOf("editorPatternCanvas", editorStart);
  const editorCanvasEnd = wxml.indexOf("></canvas>", editorCanvas);
  const canvasBlock = wxml.slice(editorCanvas, editorCanvasEnd);

  assert(editorStart >= 0, "missing fullscreen editor");
  assert(editorCanvas > editorStart, "editor should render a dedicated canvas");
  assert(canvasBlock.includes('catchtouchstart="onEditorCanvasTouchStart"'), "editor canvas should handle touch start directly");
  assert(canvasBlock.includes('catchtouchmove="onEditorCanvasTouchMove"'), "editor canvas should handle touch move directly");
  assert(!wxml.includes("editor-touch-layer"), "editor should not use a transparent touch layer that can drift from the canvas");
  assert(grid === -1, "editor should not render per-cell DOM grid");
  assert(!wxml.includes('catchtap="selectEditCell"'), "editor should not bind taps to thousands of cells");
  assert(!wxml.includes("editor-cell-label"), "editor cells should not show bead codes inside the grid");
});

test("fullscreen editor shows positioning guides while a cell is pressed", () => {
  const editorStart = wxml.indexOf("pattern-editor-fullscreen");
  const canvasFrame = wxml.indexOf("editor-canvas-frame", editorStart);
  const editorCanvas = wxml.indexOf("editorPatternCanvas", canvasFrame);
  const guideState = pageTs.indexOf("editorGuideCellKey");
  const setGuide = pageTs.indexOf("setEditorGuideCell", guideState);
  const clearGuide = pageTs.indexOf("clearEditorGuideCell", setGuide);
  const drawGuide = pageTs.indexOf("drawEditorGuides", clearGuide);

  assert(editorCanvas > canvasFrame, "editor canvas should exist for press tracking");
  assert(guideState >= 0, "editor should keep guide cell state");
  assert(setGuide > guideState, "editor should set guide state from touch hits");
  assert(clearGuide > setGuide, "editor should clear guide state on release");
  assert(drawGuide > clearGuide, "editor should draw guide lines on the canvas");
});
test("fullscreen editor color panel separates candidates from full palette dropdown", () => {
  const editorStart = wxml.indexOf("pattern-editor-fullscreen");
  const panelStart = wxml.indexOf("editor-color-panel", editorStart);
  const candidateArea = wxml.indexOf("edit-candidate-section", panelStart);
  const dropdownToggle = wxml.indexOf("toggleEditPaletteDropdown", panelStart);
  const dropdownList = wxml.indexOf("edit-dropdown-list", dropdownToggle);
  const searchInput = wxml.indexOf("onEditSearchInput", dropdownList);

  assert(panelStart > editorStart, "missing editor color panel");
  assert(candidateArea > panelStart, "color panel should expose a candidate color area");
  assert(wxml.includes("edit-candidate-chip"), "candidate colors should render as compact chips");
  assert(dropdownToggle > candidateArea, "color panel should expose a full palette dropdown after candidates");
  assert(dropdownList > dropdownToggle, "dropdown should render a visual color list");
  assert(searchInput > dropdownList, "dropdown should keep search inside the full palette area");
  assert(!wxml.includes('editPaletteDropdownOpen ?'), "dropdown label should avoid quoted ternary WXML expressions");
});

test("fullscreen editor renders explicit color candidates", () => {
  const editorStart = wxml.indexOf("pattern-editor-fullscreen");
  const candidateArea = wxml.indexOf("edit-candidate-section", editorStart);
  const candidateLoop = wxml.indexOf('wx:for="{{editCandidateColors}}"', candidateArea);
  const candidateCode = wxml.indexOf("item.code", candidateLoop);

  assert(candidateArea > editorStart, "missing candidate color section");
  assert(candidateLoop > candidateArea, "candidate section should render editCandidateColors");
  assert(candidateCode > candidateLoop, "candidate chips should use palette color codes");
});

test("editor does not keep a separate transparent hit layer", () => {
  const wxss = readFileSync("miniprogram/pages/index/index.wxss", "utf8");

  assert(!wxml.includes("editor-touch-layer"), "WXML should not keep a separate transparent hit layer");
  assert(!wxss.includes(".editor-touch-layer"), "WXSS should not keep stale touch layer styles");
});
test("fullscreen editor supports canvas editing tools", () => {
  const editorStart = wxml.indexOf("pattern-editor-fullscreen");
  const panTool = wxml.indexOf('data-tool="pan"', editorStart);
  const pointTool = wxml.indexOf('data-tool="point"', editorStart);
  const paintTool = wxml.indexOf('data-tool="paint"', editorStart);
  const pickerTool = wxml.indexOf('data-tool="picker"', editorStart);
  const fillTool = wxml.indexOf('data-tool="fill"', editorStart);
  const undo = wxml.indexOf("undoEditorChange", editorStart);
  const redo = wxml.indexOf("redoEditorChange", editorStart);
  const activeColor = wxml.indexOf("activeEditColorText", editorStart);

  assert(panTool > editorStart, "editor should expose browse mode");
  assert(pointTool > panTool, "editor should expose point mode");
  assert(paintTool > pointTool, "editor should expose paint mode");
  assert(pickerTool > paintTool, "editor should expose picker mode");
  assert(fillTool > pickerTool, "editor should expose fill mode");
  assert(undo > editorStart, "editor should expose undo");
  assert(redo > undo, "editor should expose redo");
  assert(activeColor > editorStart, "editor should show selected paint color");
});

test("selecting an edit color does not automatically dim the pattern", () => {
  const methodStart = pageTs.indexOf("setActiveEditColor(paletteColor");
  const methodEnd = pageTs.indexOf("highlightUsageColor", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);

  assert(methodStart >= 0, "missing setActiveEditColor method");
  assert(!methodBody.includes("highlightedBeadCode"), "color selection should not trigger highlight mask");
});


test("editor cell actions allow raw color cells and empty cells to be repainted", () => {
  const methodStart = pageTs.indexOf("handleEditorCellAction(row");
  const methodEnd = pageTs.indexOf("applyEditorCellColor(row", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);

  assert(methodStart >= 0, "missing handleEditorCellAction method");
  assert(!methodBody.includes("if (!cell || isEmptyCell(cell))"), "editor should allow painting empty cells");
  assert(!methodBody.includes("if (!cell || !isBeadCell(cell))"), "editor should not block raw color cells before repainting");
});

test("pattern generation clears loading after success or failure", () => {
  const methodStart = pageTs.indexOf("async generatePattern()");
  const methodEnd = pageTs.indexOf("\n  waitForGeneration", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);
  const finallyStart = methodBody.indexOf("finally");

  assert(methodStart >= 0, "missing generatePattern method");
  assert(finallyStart > 0, "generatePattern should use finally for loading cleanup");
  assert(methodBody.slice(finallyStart).includes("isGenerating: false"), "generation should clear loading in finally");
});

test("editor touch hit testing uses the canvas rect", () => {
  const queryStart = pageTs.indexOf("refreshEditorCanvasRect(done?");
  const queryBody = pageTs.slice(queryStart, pageTs.indexOf("getTouchPagePoint", queryStart));

  assert(queryStart >= 0, "missing editor rect refresh");
  assert(queryBody.includes('select("#editorPatternCanvas")'), "editor hit testing should query the same canvas that receives touches");
  assert(!queryBody.includes('select("#editorTouchLayer")'), "editor hit testing should not query a separate transparent layer");
});

test("editor canvas height follows the pattern instead of fixed screen height", () => {
  const methodStart = pageTs.indexOf("initializeEditorCanvas(result?");
  const methodEnd = pageTs.indexOf("editorZoomIn", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);

  assert(methodStart >= 0, "missing initializeEditorCanvas method");
  assert(!methodBody.includes("windowHeight * 0.52"), "editor canvas should not reserve a fixed screen-height block");
  assert(methodBody.includes("patternHeight"), "editor canvas height should be derived from the rendered pattern height");
});
test("editor touch start handles cells without waiting for selector query", () => {
  const methodStart = pageTs.indexOf("onEditorCanvasTouchStart(event");
  const methodEnd = pageTs.indexOf("\n  handleEditorTouchStart", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);

  assert(methodStart >= 0, "missing editor touch start handler");
  assert(methodBody.includes("this.handleEditorTouchStart(snapshot)"), "touch start should process the snapshot immediately");
  assert(!methodBody.includes("refreshEditorCanvasRect"), "touch start should not wait for an async selector query before painting");
});

test("paint stroke moves do not redraw once for guide and again for paint", () => {
  const methodStart = pageTs.indexOf("onEditorCanvasTouchMove(event");
  const methodEnd = pageTs.indexOf("\n\n  onEditorCanvasTouchEnd", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);
  const paintBranchStart = methodBody.indexOf('editorTouchMode === "paint"');
  const paintBranch = methodBody.slice(paintBranchStart);

  assert(methodStart >= 0, "missing editor touch move handler");
  assert(paintBranchStart >= 0, "missing paint move branch");
  assert(paintBranch.includes("this.setEditorGuideCell(cell, false)"), "paint move should update guide state without scheduling its own redraw");
  assert(paintBranch.includes("this.applyEditorCellColor"), "paint move should let the paint operation redraw once");
});
test("single editor paint only redraws the editor canvas", () => {
  const methodStart = pageTs.indexOf("applyEditorColor(row");
  const methodEnd = pageTs.indexOf("undoEditorChange", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);

  assert(methodStart >= 0, "missing applyEditorColor method");
  assert(methodBody.includes("drawEditorCanvas"), "painting should redraw the editor canvas");
  assert(!methodBody.includes("drawPattern(false)"), "painting one cell should not redraw the normal preview canvas");
});

test("result panel shows grid summary and usage below the pattern", () => {
  const panelStart = wxml.indexOf("result-panel");
  const canvas = wxml.indexOf("patternCanvas", panelStart);
  const summary = wxml.indexOf("result-meta-grid", canvas);
  const rows = wxml.indexOf("{{result.heightCells}} \u884c", summary);
  const cols = wxml.indexOf("{{result.widthCells}} \u5217", summary);
  const usageTitle = wxml.indexOf("\u8272\u53f7\u7edf\u8ba1", summary);
  const usageList = wxml.indexOf("usage-list", usageTitle);
  const nextPanel = wxml.indexOf("pattern-editor-fullscreen", panelStart);

  assert(panelStart >= 0, "missing result panel");
  assert(summary > canvas, "result summary should sit below the pattern canvas");
  assert(rows > summary, "summary should show row count");
  assert(cols > summary, "summary should show column count");
  assert(usageTitle > summary, "usage title should sit below result summary");
  assert(usageList > usageTitle, "usage rows should render below usage title");
  assert(nextPanel < 0 || usageList < nextPanel, "usage should stay inside the normal result area");
  assert(pageTs.includes("resultBeadCount"), "page state should expose total bead count");
});

test("editor zoom controls display the live editor scale", () => {
  const editorStart = wxml.indexOf("pattern-editor-fullscreen");
  const scaleText = wxml.indexOf("editorScaleText", editorStart);
  const methodStart = pageTs.indexOf("setEditorScale(nextScale");
  const methodEnd = pageTs.indexOf("formatScaleText", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);

  assert(editorStart >= 0, "missing fullscreen editor");
  assert(scaleText > editorStart, "editor toolbar should show live zoom percentage");
  assert(methodStart >= 0, "missing editor scale setter");
  assert(methodBody.includes("editorScaleText"), "editor scale setter should update zoom text");
});

test("editor commits avoid sending full pattern data through setData", () => {
  const methodStart = pageTs.indexOf("commitEditorResult(nextResult");
  const methodEnd = pageTs.indexOf("undoEditorChange", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);
  const setDataStart = methodBody.indexOf("this.setData({");
  const setDataBody = methodBody.slice(setDataStart);

  assert(methodStart >= 0, "missing commitEditorResult method");
  assert(methodBody.includes("this.data.result = nextResult"), "commit should update the JS-side result directly");
  assert(!setDataBody.includes("result: nextResult"), "commit should not send full pattern result through setData");
  assert(!setDataBody.includes("editorUndoStack:"), "commit should not send full undo stack through setData");
  assert(setDataBody.includes("editorUndoCount"), "commit should expose only undo count to WXML");
  assert(pageTs.includes("pushEditorPatchHistory"), "page should use the shared editor patch history abstraction");
  assert(!pageTs.includes("editorUndoStackCache"), "page should not keep a handwritten undo stack");
  assert(!pageTs.includes("editorRedoStackCache"), "page should not keep a handwritten redo stack");
});

test("editor pan move updates JS state and schedules one canvas redraw", () => {
  const methodStart = pageTs.indexOf("onEditorCanvasTouchMove(event");
  const methodEnd = pageTs.indexOf("onEditorCanvasTouchEnd", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);
  const panStart = methodBody.indexOf('editorTouchMode === "pan"');
  const paintStart = methodBody.indexOf('editorTouchMode === "paint"');
  const panBranch = methodBody.slice(panStart, paintStart);

  assert(methodStart >= 0, "missing editor touch move handler");
  assert(panStart >= 0, "missing pan move branch");
  assert(panBranch.includes("this.data.editorTranslateX ="), "pan should update translate in JS state");
  assert(panBranch.includes("requestEditorCanvasDraw"), "pan should schedule a throttled redraw");
  assert(!panBranch.includes("this.setData"), "pan move should not call setData on every touchmove");
  assert(!panBranch.includes("wx.nextTick"), "pan move should not schedule nextTick redraws on every touchmove");
});

test("fullscreen editor catches mouse wheel events", () => {
  const editorStart = wxml.indexOf("pattern-editor-fullscreen");
  const canvasFrame = wxml.indexOf("editor-canvas-frame", editorStart);
  const handler = pageTs.indexOf("onEditorWheel()");

  assert(editorStart >= 0, "missing fullscreen editor");
  assert(wxml.slice(editorStart, canvasFrame).includes('catchwheel="onEditorWheel"'), "fullscreen editor should catch wheel events");
  assert(wxml.slice(canvasFrame, wxml.indexOf("editor-color-panel", canvasFrame)).includes('catchwheel="onEditorWheel"'), "editor canvas frame should catch wheel events");
  assert(handler >= 0, "page should define a wheel handler");
});

test("exported pattern image includes rulers and usage statistics", () => {
  const drawStart = pageTs.indexOf("drawPattern(forExport");
  const drawEnd = pageTs.indexOf("previewPattern", drawStart);
  const drawBody = pageTs.slice(drawStart, drawEnd);

  assert(drawStart >= 0, "missing drawPattern method");
  assert(drawBody.includes("drawExportRulers"), "export should draw row and column rulers");
  assert(drawBody.includes("drawExportUsage"), "export should draw usage statistics");
  assert(drawBody.includes("exportStatsHeight"), "export canvas should reserve usage area below the pattern");
});

test("exported usage legend is compact and code-count only", () => {
  const methodStart = pageTs.indexOf("drawExportUsage(context");
  const methodEnd = pageTs.indexOf("textColorFor", methodStart);
  const methodBody = pageTs.slice(methodStart, methodEnd);

  assert(methodStart >= 0, "missing export usage renderer");
  assert(methodBody.includes("exportUsageColumns"), "export legend should calculate horizontal columns");
  assert(methodBody.includes("item.beadCode"), "export legend should include bead code");
  assert(methodBody.includes("item.count"), "export legend should include bead count");
  assert(!methodBody.includes("item.beadName"), "export legend should not include bead name");
});

test("exported pattern image draws prominent five-cell grid lines", () => {
  const drawStart = pageTs.indexOf("drawPattern(forExport");
  const drawEnd = pageTs.indexOf("previewPattern", drawStart);
  const drawBody = pageTs.slice(drawStart, drawEnd);

  assert(drawStart >= 0, "missing drawPattern method");
  assert(drawBody.includes("drawExportGroupGrid"), "export should draw group grid lines");
  assert(pageTs.includes("col += 5"), "vertical group grid lines should use a step of five cells");
  assert(pageTs.includes("row += 5"), "horizontal group grid lines should use a step of five cells");
  assert(pageTs.includes("#ff2f92"), "group grid line color should be visually distinct");
});

test("PC devtools export downloads and saves to local persistent storage", () => {
  const exportStart = pageTs.indexOf("exportPng()");
  const exportEnd = pageTs.indexOf("  isDevtoolsTempPath", exportStart);
  const exportBody = pageTs.slice(exportStart, exportEnd);

  assert(exportStart >= 0, "missing exportPng method");
  assert(exportBody.includes("showDevtoolsExportMenu"), "devtools temp path should use the PC export menu");
  assert(pageTs.includes("wx.downloadFile"), "PC export should download http temp file first");
  assert(pageTs.includes("wx.getFileSystemManager"), "PC export should use file system to save");
  assert(pageTs.includes("wx.previewImage"), "PC export should preview saved image");
});
test("AI image devtools temp path previews instead of using pattern export menu", () => {
  const aiSaveStart = pageTs.indexOf("async saveAiTempImageToAlbum");
  const aiSaveEnd = pageTs.indexOf("exportPng()", aiSaveStart);
  const aiSaveBody = pageTs.slice(aiSaveStart, aiSaveEnd);

  assert(aiSaveStart >= 0, "missing AI temp image save method");
  assert(aiSaveBody.includes("wx.previewImage"), "AI devtools temp image should open preview");
  assert(!aiSaveBody.includes("showDevtoolsExportMenu"), "AI image save should not use pattern export menu");
});