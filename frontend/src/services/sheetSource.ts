export function parseSheetSource(input: string): { spreadsheetId: string; gid?: number } {
  const value = input.trim();
  if (!value) throw new Error('Dán link Google Sheets để chọn nguồn dữ liệu.');
  if (/^[A-Za-z0-9_-]+$/.test(value)) return { spreadsheetId: value };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Link Google Sheets không hợp lệ.');
  }
  const match = url.pathname.match(/^\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'docs.google.com' ||
    url.username ||
    url.password ||
    !match
  )
    throw new Error(
      'Dùng link https://docs.google.com/spreadsheets/d/... hoặc mã file Google Sheets.',
    );
  const gid = new URLSearchParams(url.hash.slice(1)).get('gid') ?? url.searchParams.get('gid');
  return {
    spreadsheetId: match[1],
    ...(gid !== null && /^\d+$/.test(gid) && Number.isSafeInteger(Number(gid))
      ? { gid: Number(gid) }
      : {}),
  };
}

export function chooseSheetTab(
  tabs: { sheetId: number; title: string }[],
  source: { spreadsheetId: string; gid?: number },
  saved: { spreadsheetId?: string; sheetName?: string },
) {
  if (source.gid !== undefined) return tabs.find((tab) => tab.sheetId === source.gid)?.title ?? '';
  if (
    source.spreadsheetId === saved.spreadsheetId &&
    tabs.some((tab) => tab.title === saved.sheetName)
  )
    return saved.sheetName!;
  return '';
}
