import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: '__MSG_extension_name__',
    description: '__MSG_extension_description__',
    default_locale: 'ca',
    permissions: [
      'storage',
      'activeTab',
      'contextMenus',
      'scripting',
    ],
    host_permissions: [],
    optional_host_permissions: ['<all_urls>'],
    action: {
      default_title: '__MSG_extension_name__',
    },
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      96: 'icon-96.png',
      128: 'icon-128.png',
    },
    web_accessible_resources: [
      {
        resources: ['icon-*.png'],
        matches: ['<all_urls>'],
      },
    ],
  },
  webExt: {
    disabled: false,
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
  },
  zip: {
    name: 'corrector-catala',
  },
});
