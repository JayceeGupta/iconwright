// Copy buttons on code blocks, and "Copy page as Markdown" on docs pages.
async function copy(text, button, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = done;
    setTimeout(() => { button.textContent = old; }, 1600);
  } catch { button.textContent = 'Copy failed'; }
}

for (const pre of document.querySelectorAll('pre')) {
  const b = document.createElement('button');
  b.className = 'copy'; b.type = 'button'; b.textContent = 'Copy';
  b.addEventListener('click', () => copy(pre.querySelector('code')?.innerText ?? pre.innerText, b));
  pre.append(b);
}

for (const b of document.querySelectorAll('[data-copy-md]')) {
  b.addEventListener('click', async () => {
    const res = await fetch(b.dataset.copyMd);
    copy(await res.text(), b, 'Copied as Markdown');
  });
}
