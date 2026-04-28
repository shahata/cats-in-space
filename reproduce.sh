#!/usr/bin/env bash
# Reproduces a Wix Stores V3 bug: published Translation Manager translations
# are NOT applied to `freeTextSettings.title` on FREE_TEXT modifiers when the
# V3 `products/query` endpoint is called with a valid `x-wix-linguist` header.
#
# Surrounding fields (product `name`, modifier `name`, choice `name`) DO
# translate via the same call — so this is a specific gap, not a global outage.
#
# Side A: translation-content/v1 confirms the translation is stored with
#         publishStatus: PUBLISHED and `published: true` on every field.
# Side B: stores/v3/products/query for the SAME entity returns the EN
#         `freeTextSettings.title` while translating every adjacent field.
#
# Usage:    ./reproduce.sh [locale]      # locale defaults to `he`; try `ja` or `ru`
# Requires: bash, curl, jq, npx (Wix CLI), and a Wix login that owns the site.

#set -euo pipefail

SITE_ID=94a91a45-55f1-4305-ba70-a862aa2fa060
ACCOUNT_ID=4975b698-64ae-4833-b4c9-71bac6d53fb0
INSTANCE_ID=6f95cec8-3e98-48b9-b4e5-1fb92fcd9973
PRODUCT_SLUG=quantum-yarn-ball
CUSTOMIZATIONS_SCHEMA_ID=bc07ae7d-c2ff-4495-8b7e-5a2dabe1636c
ENGRAVING_ENTITY_ID=e1a11fe6-ca10-45fb-871c-4c7c2fef654f

# x-wix-linguist format (from @wix/headers/linguist.js):
#   <lang>|<locale>|<isPrimaryLanguage>|<instanceId>
LINGUIST="he|he-IL|false|$INSTANCE_ID"

TOKEN=$(npx wix token -s "$SITE_ID" 2>/dev/null \
  | tr -d '\r' \
  | grep -m1 '^OauthNG\.JWS\.')

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: could not obtain CLI site token. Run: npx wix login" >&2
  exit 1
fi

hr() { printf '\n=== %s ===\n' "$1"; }

hr "(A) translation-content/v1 — translation IS stored & published for locale=he"
curl -s -X POST 'https://www.wixapis.com/translation-content/v1/contents/query' \
  -H "Authorization: $TOKEN" \
  -H "wix-site-id: $SITE_ID" \
  -H "wix-account-id: $ACCOUNT_ID" \
  -H 'Content-Type: application/json' \
  -d "{
    \"query\":{\"filter\":{
      \"locale\":\"he\",
      \"schemaId\":\"$CUSTOMIZATIONS_SCHEMA_ID\",
      \"entityId\":\"$ENGRAVING_ENTITY_ID\"
    }}}" \
  | jq '{
      publishStatus: .contents[0].publishStatus,
      fields: (.contents[0].fields
        | with_entries({key: .key, value: {textValue: .value.textValue, published: .value.published}}))
    }'

hr "(B) stores/v3/products/query — same entity, x-wix-linguist=$LINGUIST"
echo "    Adjacent fields translate; freeTextSettings.title does NOT (bug)."
curl -s -X POST 'https://www.wixapis.com/stores/v3/products/query' \
  -H "Authorization: $TOKEN" \
  -H "wix-site-id: $SITE_ID" \
  -H "wix-account-id: $ACCOUNT_ID" \
  -H "x-wix-linguist: $LINGUIST" \
  -H 'Content-Type: application/json' \
  -d "{\"query\":{\"filter\":{\"slug\":\"$PRODUCT_SLUG\"}}}" \
  | jq --arg id "$ENGRAVING_ENTITY_ID" '
      .products[0]
      | { "product.name (translates ✓)": .name,
          modifier: (.modifiers[] | select(.id == $id)
            | { id,
                "modifier.name (translates ✓)":              .name,
                "modifier.freeTextSettings.title (BUG — EN)": .freeTextSettings.title }) }'

cat <<EOF

Expected: \`freeTextSettings.title\` matches the published translation from (A).
Observed: \`freeTextSettings.title\` stays in the source language even though
          \`product.name\` and the FREE_TEXT modifier's own \`name\` on the
          SAME modifier translate correctly via the same call. This is
          specific to the \`freeTextSettings\` sub-object on FREE_TEXT
          modifiers in the V3 Stores Catalog API.
EOF
