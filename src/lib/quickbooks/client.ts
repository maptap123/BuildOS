/**
 * QuickBooks Online API Client — STUB
 *
 * Phase 4 integration. None of these methods are wired up yet.
 * Implement when QB OAuth credentials are provisioned.
 *
 * Required environment variables (add to Vercel + .env.local when ready):
 *   QB_CLIENT_ID          — from developer.intuit.com
 *   QB_CLIENT_SECRET      — from developer.intuit.com
 *   QB_REDIRECT_URI       — e.g. https://app.jdcplatform.com/api/integrations/quickbooks/callback
 *   QB_ENVIRONMENT        — 'sandbox' | 'production'
 *
 * Reference: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization
 */

export interface QBSyncResult {
  ok: boolean
  qb_id?: string
  message?: string
}

export interface QBTokens {
  access_token: string
  refresh_token: string
  realm_id: string
  expires_at: Date
}

export class QuickBooksClient {
  private realmId: string

  constructor(realmId: string) {
    this.realmId = realmId
  }

  /**
   * Sync a JDC job to QuickBooks as a Customer + Project.
   *
   * TODO (Phase 4): implement
   *   1. Refresh token if expired
   *   2. Upsert QB Customer: POST /v3/company/{realmId}/customer
   *   3. Upsert QB Project under that customer
   *   4. Return { ok: true, qb_id: customer.Id }
   *
   * Reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer
   */
  async syncJob(_jobId: string): Promise<QBSyncResult> {
    // TODO: implement — Phase 4
    throw new Error('QuickBooks integration not yet configured')
  }

  /**
   * Sync a JDC bill/actual to QuickBooks as a Bill.
   *
   * TODO (Phase 4): implement
   *   1. Map JDC actual → QB Bill payload
   *   2. POST /v3/company/{realmId}/bill
   *   3. Store qb_bill_id on the actuals row
   *
   * Reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/bill
   */
  async syncBill(_billId: string): Promise<QBSyncResult> {
    // TODO: implement — Phase 4
    throw new Error('QuickBooks integration not yet configured')
  }

  /**
   * Sync a JDC invoice to QuickBooks as an Invoice.
   *
   * TODO (Phase 4): implement
   *   1. Map JDC invoice → QB Invoice payload
   *   2. POST /v3/company/{realmId}/invoice
   *   3. Store qb_invoice_id on the invoice row
   *
   * Reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice
   */
  async syncInvoice(_invoiceId: string): Promise<QBSyncResult> {
    // TODO: implement — Phase 4
    throw new Error('QuickBooks integration not yet configured')
  }

  /**
   * Build the QB OAuth 2.0 authorization URL to redirect the user to.
   *
   * TODO (Phase 4): implement using intuit-oauth or manual PKCE flow
   *   Scopes needed: com.intuit.quickbooks.accounting
   *
   * Reference: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
   */
  static getAuthUrl(_state?: string): string {
    // TODO: implement — Phase 4
    throw new Error('QuickBooks integration not yet configured')
  }

  /**
   * Exchange the OAuth callback code for access + refresh tokens.
   * Tokens should be encrypted before storage (use QB_TOKEN_ENCRYPTION_KEY).
   *
   * TODO (Phase 4): implement
   *   1. POST to https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
   *   2. Store encrypted tokens in quickbooks_tokens table
   *   3. Update integration_settings: is_connected=true, realm_id
   */
  static async handleCallback(_code: string, _realmId: string): Promise<QBTokens> {
    // TODO: implement — Phase 4
    throw new Error('QuickBooks integration not yet configured')
  }
}
