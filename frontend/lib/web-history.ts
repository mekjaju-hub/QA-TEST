/** Link to one test case of a page history (Web History → Test Case detail). */
export function caseHref(key: string, hid: string): string {
  return `/web-explorer/history/case?key=${encodeURIComponent(key)}&hid=${encodeURIComponent(hid)}`;
}
