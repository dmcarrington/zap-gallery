/**
 * Nostr event kind constants and gallery image types.
 *
 * Kind constants and GalleryImage / parseImageEvent live in zap-gallery-sdk;
 * this module just re-exports them so existing imports keep working.
 */

export {
	KIND_GALLERY_META,
	KIND_IMAGE_LISTING,
	KIND_APP_DATA,
	KIND_ZAP_RECEIPT,
	KIND_SEALED_DM,
	parseImageEvent,
	type GalleryImage
} from 'zap-gallery-sdk';
