import re

with open('src/instant-overlay.tsx', 'r') as f:
    code = f.read()

# 1. Add state for renderedResult
old_state = 'const [exportProgress, setExportProgress] = useState<number | null>(null);'
new_state = """const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [renderedResult, setRenderedResult] = useState<{ blob: Blob, extension: string, url: string } | null>(null);"""
code = code.replace(old_state, new_state)

# 2. Clear renderedResult on settings patch
old_patch = """  const patch = <K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };"""
new_patch = """  const patch = <K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setRenderedResult(null);
  };"""
code = code.replace(old_patch, new_patch)

# 3. Modify exportVideo to be renderVideo and save result instead of downloading
old_export_block = """      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `wicklapse-${spec.symbol}-${Date.now()}.${result.extension}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Video export failed.");
    } finally {
      setExportProgress(null);
    }
  };"""

new_export_block = """      const url = URL.createObjectURL(result.blob);
      if (renderedResult) URL.revokeObjectURL(renderedResult.url);
      setRenderedResult({ blob: result.blob, extension: result.extension, url });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Video export failed.");
    } finally {
      setExportProgress(null);
    }
  };

  const handleDownload = () => {
    if (!renderedResult || !spec) return;
    const anchor = document.createElement("a");
    anchor.href = renderedResult.url;
    anchor.download = `wicklapse-${spec.symbol}-${Date.now()}.${renderedResult.extension}`;
    anchor.click();
  };

  const handleShare = async () => {
    if (!renderedResult || !spec) return;
    try {
      const file = new File([renderedResult.blob], `wicklapse-${spec.symbol}.${renderedResult.extension}`, { type: renderedResult.blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Wicklapse - ${spec.symbol}`,
        });
      } else {
        setError("Your browser does not support sharing this video file. Please download it instead.");
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError("Sharing failed or was blocked.");
      }
    }
  };"""

code = code.replace(old_export_block, new_export_block)

# 4. Update the buttons in the UI
old_buttons = """              <button type="button" className="wick-primary wick-export" disabled={exportProgress !== null} onClick={() => void exportVideo()}>{exportProgress !== null ? "Rendering…" : "Download"}</button>"""

new_buttons = """              {!renderedResult ? (
                <button type="button" className="wick-primary wick-export" disabled={exportProgress !== null} onClick={() => void exportVideo()}>{exportProgress !== null ? "Rendering…" : "Render Video"}</button>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="wick-primary wick-export" style={{ flex: 1 }} onClick={handleDownload}>Download</button>
                  {typeof navigator !== 'undefined' && navigator.canShare && (
                    <button type="button" className="wick-secondary wick-export" style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} onClick={() => void handleShare()}>Share</button>
                  )}
                </div>
              )}"""

code = code.replace(old_buttons, new_buttons)

with open('src/instant-overlay.tsx', 'w') as f:
    f.write(code)
