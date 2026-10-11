/** Hands a file to the browser's download, as if the learner had clicked a link to it. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the address stops working.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
