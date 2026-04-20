import { siteProperties } from '@wix/business-tools';
import { auth } from '@wix/essentials';

/**
 * Fetches the site's payment currency (ISO-4217 code, e.g. "ILS") via the
 * Wix Site Properties SDK. This is the authoritative source for the site-wide
 * currency used to bill customers.
 */
export async function getSiteCurrency(): Promise<string> {
	try {
		const elevated = auth.elevate(siteProperties.getSiteProperties);
		const res = await elevated();
		return res.properties?.paymentCurrency || 'USD';
	} catch {
		return 'USD';
	}
}
