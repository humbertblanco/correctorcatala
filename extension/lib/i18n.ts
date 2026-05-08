export type MessageKey =
  | 'extension_name'
  | 'extension_description'
  | 'popup_title'
  | 'popup_enabled'
  | 'popup_disabled'
  | 'popup_toggle_global'
  | 'popup_toggle_domain'
  | 'popup_open_options'
  | 'popup_donate'
  | 'variant_label'
  | 'variant_auto'
  | 'variant_central'
  | 'variant_valencia'
  | 'variant_balear'
  | 'variant_castella'
  | 'variant_detected'
  | 'options_title'
  | 'options_server_section'
  | 'options_server_url'
  | 'options_server_url_help'
  | 'options_server_test'
  | 'options_server_ok'
  | 'options_server_fail'
  | 'options_dict_section'
  | 'options_dict_help'
  | 'options_domains_section'
  | 'options_domains_help'
  | 'options_save'
  | 'options_saved'
  | 'suggestion_apply'
  | 'suggestion_dismiss'
  | 'suggestion_add_to_dictionary'
  | 'suggestion_ignore_here'
  | 'suggestion_no_replacements'
  | 'error_offline'
  | 'error_unsupported_editor'
  | 'error_rate_limited'
  | 'donate_url'
  | 'toast_unsupported_title'
  | 'toast_unsupported_body'
  | 'toast_open_web'
  | 'toast_dismiss'
  | 'popup_open_corrector_web';

export function t(key: MessageKey, ...substitutions: string[]): string {
  const result = chrome.i18n.getMessage(key, substitutions);
  return result || key;
}

export function variantLabel(variant: 'ca-ES' | 'ca-ES-valencia' | 'ca-ES-balear' | 'es'): string {
  switch (variant) {
    case 'es':
      return t('variant_castella');
    case 'ca-ES-valencia':
      return t('variant_valencia');
    case 'ca-ES-balear':
      return t('variant_balear');
    default:
      return t('variant_central');
  }
}
