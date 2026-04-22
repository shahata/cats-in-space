import { siteProperties } from '@wix/business-tools';
import { auth } from '@wix/essentials';

/**
 * Fetches the site's payment currency (ISO-4217 code, e.g. "ILS") via the
 * Wix Site Properties SDK. This is the authoritative source for the site-wide
 * currency used to bill customers. Throws if the site has no configured
 * payment currency — callers must treat that as a fatal misconfiguration
 * rather than silently falling back to a hard-coded default.
 */
export async function getSiteCurrency(): Promise<string> {
	const elevated = auth.elevate(siteProperties.getSiteProperties);
	const res = await elevated();
	const currency = res.properties?.paymentCurrency;
	if (!currency) throw new Error('Site paymentCurrency is not configured in Wix Site Properties.');
	return currency;
}
