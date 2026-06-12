import { defineContentScript } from 'wxt/sandbox';
import { Content } from '~/Content';

export default defineContentScript({
  matches: ['*://*.dognzb.cr/*'],
  main(ctx) {
    new DognzbContent(ctx);
  },
});

class DognzbContent extends Content {
  get id() {
    return 'dognzb';
  }

  get useLightTheme() {
    return true;
  }

  // Dognzb uses an ajax filter, watch for dom changes and update links
  observer: MutationObserver | undefined;

  get isDetail(): boolean {
    return window.location.pathname.startsWith('/details');
  }

  get isList(): boolean {
    return !this.isDetail && document.querySelectorAll('tr[id^="row"]').length > 0;
  }

  get uid(): string {
    return document.getElementById('label')?.textContent?.trim() ?? '';
  }

  get apikey(): string {
    return (
      document.querySelector('input[name="rsstoken" i]')?.getAttribute('value') ?? ''
    );
  }

  getNzbUrl(id: string): string {
    return `${window.location.protocol}//dl.${window.location.host}/fetch/${id}/${this.apikey}`;
  }

  async ready() {
// Only apply CSS fix in Chrome — Firefox handles CSP differently and shows the icon fine
const isChrome = navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Firefox');

if (isChrome) {
  const style = document.createElement('style');
  style.textContent = `
    .NZBUnityLink {
      background-image: none !important;
      min-width: 16px !important;
      border-radius: 2px !important;
      background-color: #40a040 !important;
      color: white !important;
      font-size: 13px !important;
      font-weight: bold !important;
      text-align: center !important;
      line-height: 16px !important;
      text-decoration: none !important;
    }
    .NZBUnityLink::before {
      content: '↓' !important;
    }
    .NZBUnityLink.pending { background-color: #808080 !important; }
    .NZBUnityLink.success { background-color: #40a040 !important; }
    .NZBUnityLink.error   { background-color: #cc3333 !important; }
  `;
  document.head.appendChild(style);
}
    
    this.observer = new MutationObserver((mutations) => {
      console.info(`[NZB Unity] Content changed, updating links...`);
      this.onReady(); // Re-run initialization
    });
    if (document.getElementById('content'))
      this.observer.observe(document.getElementById('content')!, { childList: true });

    // warn on missing parms
    this.debug(`[NZB Unity] ready()`, { uid: this.uid, apikey: this.apikey });
    if (!this.uid) console.warn(`[NZB Unity] Unable to find username`);
    if (!this.apikey) console.warn(`[NZB Unity] Unable to find apikey`);
  }

  initializeDetailLinks = () => {
    this.debug(`[NZB Unity] initializeDetailLinks()`);
    const [, id] = window.location.pathname.match(/\/details\/(\w+)/i) ?? [];
    if (!id) return;

    // Get the category
    const category =
      document
        .querySelector('#details tr:nth-child(3) td:nth-child(2)')
        ?.textContent?.split(/\s*->\s*/)[0] ?? '';

    const link = this.createAddUrlLink({
      url: this.getNzbUrl(id),
      category,
    });

    const download = document.querySelector('[onclick^="doOneDownload"]');
    if (download && this.replaceLinks) {
      download.replaceWith(link);
      link.style.padding = '0 0 0 5px';
      link.insertAdjacentText('beforeend', ' download');
    } else {
      document
        .querySelector('#preview .btn-group')
        ?.closest('tr')
        ?.querySelector('td:first-child')
        ?.append(link);
    }
  };

  initializeListLinks = () => {
    this.debug(`[NZB Unity] initializeListLinks()`);

    for (const el of document.querySelectorAll('[onclick^="doOneDownload"]')) {
      const a = el as HTMLAnchorElement;
      const [, id] = a.getAttribute('onclick')?.match(/\('(\w+)'\)/i) ?? [];
      if (!id) return;

      // Get the category
      const catLabel = a
        .closest('tr')
        ?.querySelector('.label:not(.label-empty):not(.label-important)');
      const category = catLabel?.textContent?.trim() ?? '';

      const link = this.createAddUrlLink({
        url: this.getNzbUrl(id),
        category,
        linkOptions: {
          styles: { margin: '0 0 0 2px' },
        },
      });

      link.addEventListener('nzb.success', (e) => {
        catLabel
          ?.closest('tr')
          ?.insertAdjacentHTML(
            'afterbegin',
            '<td width="19"><div class="dog-icon-tick"></div></td>',
          );
      });

      if (this.replaceLinks) {
        a.closest('td')?.setAttribute('width', '20');
        a.replaceWith(link);
      } else {
        a.closest('td')?.setAttribute('width', '40');
        a.style.float = 'left';
        a.insertAdjacentElement('afterend', link);
      }
    }

    // Create download all buttons
    for (const el of document.querySelectorAll('[onclick^="doZipDownload"]')) {
      const button = this.createButton({
        styles: { margin: '0 0.3em 0 0' },
      });

      button.addEventListener('click', async (e) => {
        e.preventDefault();
        this.addUrlsFromElementsAndNotify(
          button,
          // Get all the checked checkboxes
          document.querySelectorAll('#featurebox .ckbox:checked'),
          // Get the ID from each checkbox
          (el) => {
            const [, id] =
              (el as HTMLInputElement)
                .closest('tr')
                ?.querySelector('[onclick^="doOneDownload"]')
                ?.getAttribute('onclick')
                ?.match(/\('(\w+)'\)/i) ?? [];
            return id;
          },
          // Get the category from each checkbox
          (el) => {
            return (
              (el as HTMLInputElement)
                .closest('tr')
                ?.querySelector('.label:not(.label-empty):not(.label-important)')
                ?.textContent?.trim() ?? ''
            );
          },
        );
      });

      el.insertAdjacentElement('beforebegin', button);
    }
  };
}
