import { XummTypes } from 'xumm-sdk';

export interface GenericBackendPostRequestOptions {
    frontendId?: string,
    web?: boolean,
    pushDisabled?: boolean,
    referer?: string,
    xrplAccount?: string,
    signinToValidate?: boolean,
    issuing?: boolean,
    isRawTrx?: boolean
}

export interface GenericBackendPostRequest {
    options?: GenericBackendPostRequestOptions,
    payload: XummTypes.XummPostPayloadBodyJson
}

export interface TransactionValidation {
    success: boolean,
    testnet: boolean,
    txid?: string,
    error?: boolean,
    message?: string,
    payloadExpired?: boolean,
    noValidationTimeFrame?: boolean,
    redirect?: boolean,
    account?: string,
    payloadId?: string
}

export interface TrustLine {
    account:string,
    balance: string,
    currency: string,
    limit: string,
    limit_peer: string,
    no_ripple: boolean,
    balanceN?: number,
    limitN?: number
}

export interface SimpleTrustline {
    issuer: string,
    currency: string,
    currencyShow: string,
    balance: number,
    balanceShow: number
}
