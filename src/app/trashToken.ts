import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { XummService } from './services/xumm.service'
import { XRPLWebsocket } from './services/xrplWebSocket';
import { Observable, Subject, Subscription } from 'rxjs';
import { GenericBackendPostRequest, RippleState, SimpleTrustline } from './utils/types';
import * as flagUtil from './utils/flagutils';
import { MatStepper } from '@angular/material/stepper';
import * as normalizer from './utils/normalizers';
import { isValidXRPAddress } from 'src/app/utils/utils';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatSnackBar } from '@angular/material/snack-bar';
import { XummTypes } from 'xumm-sdk';
import { TypeWriter } from './utils/TypeWriter';
import * as clipboard from 'copy-to-clipboard';
import * as transactionParser from 'ripple-lib-transactionparser'
import { CheckLiquidity } from './utils/liquidity/checkLiquidityForToken';

//Trustset flags
const tfClearFreeze = 0x200000;
const tfClearNoRipple = 0x40000;
const tfSetNoRipple = 0x20000;

//Offercreate Flags
const tfImmediateOrCancel = 0x20000;
const tfSell = 0x80000;

//RippleState Flags
const lsfLowReserve = 0x10000;
const lsfHighReserve = 0x20000;

const lsfLowFreeze = 0x400000;
const lsfHighFreeze = 0x800000;

@Component({
  selector: 'trashToken',
  templateUrl: './trashToken.html'
})
export class TrashToken implements OnInit, OnDestroy {

  constructor(
    private xummApi: XummService,
    private snackBar: MatSnackBar,
    private overlayContainer: OverlayContainer,
    private xrplWebSocket: XRPLWebsocket) { }
  
  
  xrplAccountInfo:any = null;
  existingAccountLines:RippleState[] = [];
  simpleTrustlines:SimpleTrustline[] = [];

  existingOffersForToken:any[] = [];
  removedOffersForToken:any[] = [];

  selectedToken:SimpleTrustline = null;

  //burnOnly:boolean = false;

  usePathFind:boolean = false;
  pathFind:any = null;

  searchString:string = null;

  canConvert:boolean = false;
  convertionStarted:boolean = false;
  skipConvertion:boolean = false;
  convertAmountXRP:number = null;
  couldNotConvertAll:boolean = false;

  burnOnly:boolean = false;

  liquidityChecker:CheckLiquidity = null;

  gainedFromConverting:number = 0;
  gainedFromRemoving:number = 0;
  gainedFromOffers:number = 0;
  gainedTotal:number = 0;

  defaultRippleSet:boolean = false;

  issuerRequiresDestinationTag:boolean = false;
  issuerHasGlobalFreezeSet:boolean = false;
  xrplclusterRequiresDestinationTag:boolean = false;

  checkBoxSkipDialogs:boolean = false;
  checkboxSendToIssuer:boolean = false;
  checkBoxBurnToken:boolean = false;

  isXummProUser:boolean = false;
  showSkipDialogInfo:boolean = false;

  transactionSuccessfull: Subject<void> = new Subject<void>();

  isTestMode:boolean = false;

  accountReserve:number = 10000000;
  ownerReserve:number = 2000000;

  sessionCounter:number = 1;

  paymentRequired:boolean = false;
  paymentAmount:number = 0;
  paymentSuccessful:boolean = false;
  paymentStarted:boolean = false;

  maxPaymentAmount:number = 10;

  @Input()
  ottChanged: Observable<any>;

  @Input()
  themeChanged: Observable<any>;

  private ottReceived: Subscription;
  private themeReceived: Subscription;

  themeClass = 'dark-theme';
  backgroundColor = '#000000';

  loadingData:boolean = false;
  applyFilters:boolean = false;

  infoLabel:string = null;
  infoLabel2:string = null;
  infoLabel3:string = null;

  errorLabel:string = null;

  title: string = "XRPL Services xApp";
  tw: TypeWriter

  @ViewChild('stepper') stepper: MatStepper;

  async ngOnInit(): Promise<void> {

    this.loadingData = true;

    this.liquidityChecker = CheckLiquidity.Instance;

    this.loadFeeReserves();

    /** 
    await this.loadAccountData("r9nwWypnjHsw98xz1hFfbNnrhrALurgXM7");
    this.loadingData = false;
    this.isXummProUser = true;
    return;
    **/

    this.ottReceived = this.ottChanged.subscribe(async ottData => {
      this.infoLabel = "ott received: " + JSON.stringify(ottData);
      //console.log("ottReceived: " + JSON.stringify(ottData));

      if(ottData) {

        //return;

        this.isXummProUser = ottData && ottData.account_info && ottData.account_info.proSubscription;

        this.infoLabel = JSON.stringify(ottData);
        
        this.isTestMode = ottData.nodetype === 'TESTNET';
        //this.isTestMode = true;

        //this.infoLabel2 = "changed mode to testnet: " + this.isTestMode;

        if(ottData && ottData.account && ottData.accountaccess == 'FULL') {
          await this.loadAccountData(ottData.account);

          try {

            //read origin data
            if(ottData.issuer && ottData.currency) {
              //console.log("having issuer and currency")
              //pre selected token!
              let preselect = this.simpleTrustlines.filter(trustline => ottData.issuer === trustline.issuer && ottData.currency === trustline.currency );

              //console.log("preselect: " + JSON.stringify(preselect));

              if(preselect && preselect.length === 1) {

                //we found a token to preselect. check burnOnly property!
                this.burnOnly = ottData.burnOnly && ottData.burnOnly === 'true';

                //console.log("select token!");
                setTimeout( () => this.selectToken(preselect[0]), 100);
              }
            }
          } catch(err) {
            //nothing if it fails.. just reset some things
            this.selectedToken = null;
          }

          this.loadingData = false;

          //await this.loadAccountData(ottData.account); //false = ottResponse.node == 'TESTNET' 
        } else {
          this.xrplAccountInfo = "no account";
          this.loadingData = false;
        }

        this.infoLabel = JSON.stringify(this.xrplAccountInfo);
      }

      //this.testMode = true;
      //await this.loadAccountData("rELeasERs3m4inA1UinRLTpXemqyStqzwh");
      //await this.loadAccountData("r9N4v3cWxfh4x6yUNjxNy3DbWUgbzMBLdk");
    });

    this.themeReceived = this.themeChanged.subscribe(async appStyle => {

      //this.infoLabel2 = JSON.stringify(appStyle);

      this.themeClass = appStyle.theme;
      this.backgroundColor = appStyle.color;

      var bodyStyles = document.body.style;
      bodyStyles.setProperty('--background-color', this.backgroundColor);
      this.overlayContainer.getContainerElement().classList.remove('dark-theme');
      this.overlayContainer.getContainerElement().classList.remove('light-theme');
      this.overlayContainer.getContainerElement().classList.remove('moonlight-theme');
      this.overlayContainer.getContainerElement().classList.remove('royal-theme');
      this.overlayContainer.getContainerElement().classList.add(this.themeClass);
    });
    //this.infoLabel = JSON.stringify(this.device.getDeviceInfo());

    this.tw = new TypeWriter(["XRPL Services xApp", "created by nixerFFM", "XRPL Services xApp"], t => {
      this.title = t;
    })

    this.tw.start();
  }

  ngOnDestroy() {
    if(this.ottReceived)
      this.ottReceived.unsubscribe();

    if(this.themeReceived)
      this.themeReceived.unsubscribe();
  }

  async loadFeeReserves() {
    let fee_request:any = {
      command: "ledger_entry",
      index: "4BC50C9B0D8515D3EAAE1E74B29A95804346C491EE1A95BF25E4AAB854A6A651",
      ledger_index: "validated"
    }

    let feeSetting:any = await this.xrplWebSocket.getWebsocketMessage("fee-settings", fee_request, this.isTestMode);

    if('ReserveBase' in feeSetting?.result?.node) {
      this.accountReserve = feeSetting?.result?.node.ReserveBase;
      this.ownerReserve = feeSetting?.result?.node.ReserveIncrement;
    } else {
      this.accountReserve = Number(feeSetting?.result?.node.ReserveBaseDrops);
      this.ownerReserve = Number(feeSetting?.result?.node.ReserveIncrementDrops);
    }

    //console.log("resolved accountReserve: " + this.accountReserve);
    //console.log("resolved ownerReserve: " + this.ownerReserve);
  }

  async waitForTransactionSigning(payloadRequest: GenericBackendPostRequest): Promise<any> {
    this.loadingData = true;
    //this.infoLabel = "Opening sign request";
    let xummResponse:XummTypes.XummPostPayloadResponse;
    try {
        payloadRequest.payload.options = {
          expire: 2
        }

        if(payloadRequest.payload.txjson.Account && isValidXRPAddress(payloadRequest.payload.txjson.Account+"")) {
          payloadRequest.payload.options.signers = [payloadRequest.payload.txjson.Account+""];
        }

        //console.log("sending xumm payload: " + JSON.stringify(xummPayload));
        xummResponse = await this.xummApi.submitPayload(payloadRequest);
        //this.infoLabel = "Called xumm successfully"
        //this.infoLabel = (JSON.stringify(xummResponse));
        if(!xummResponse || !xummResponse.uuid) {
          this.snackBar.open("Error contacting Xaman backend", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
          return null;
        }        
    } catch (err) {
        //console.log(JSON.stringify(err));
        this.snackBar.open("Could not contact Xaman backend", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        return null;
    }

    //console.log("opening sign dialog...")
    if (typeof window.ReactNativeWebView !== 'undefined') {
      //this.infoLabel = "opening sign request";
      window.ReactNativeWebView.postMessage(JSON.stringify({
        command: 'openSignRequest',
        uuid: xummResponse.uuid
      }));
    }

    //this.infoLabel = "Showed sign request to user";

    //remove old websocket
    try {

      return new Promise( async (resolve, reject) => {

        //use event listeners over websockets
        if(typeof window.addEventListener === 'function') {
          window.addEventListener("message", event => {
            try {
              if(event && event.data) {
                let eventData = JSON.parse(event.data);
        
                console.log("WINDOW: " + eventData);

                if(eventData && eventData.method == "payloadResolved") {

                  window.removeAllListeners("message");

                  if(typeof document.addEventListener === 'function') {
                    document.removeAllListeners("message");
                  }

                  if(eventData.reason == "SIGNED") {
                    //create own response
                    let message = {
                      signed: true,
                      payload_uuidv4: eventData.uuid
                    }
                    
                    resolve(message);

                  } else if(eventData.reason == "DECLINED") {
                    //user closed without signing
                    resolve(null)
                  }
                }
              }
            } catch(err) {
              //ignore errors
            }
          });
        }

        //use event listeners over websockets
        if(typeof document.addEventListener === 'function') {
          document.addEventListener("message", event => {
            try {
              let anyEvent:any = event;
              if(anyEvent && anyEvent.data) {
                let eventData = JSON.parse(anyEvent.data);
        
                console.log("WINDOW: " + eventData);

                if(eventData && eventData.method == "payloadResolved") {

                  document.removeAllListeners("message");
                  if(typeof window.addEventListener === 'function') {
                    window.removeAllListeners("message");
                  }

                  if(eventData.reason == "SIGNED") {
                    //create own response
                    let message = {
                      signed: true,
                      payload_uuidv4: eventData.uuid
                    }
                    
                    resolve(message);

                  } else if(eventData.reason == "DECLINED") {
                    //user closed without signing
                    resolve(null)
                  }
                }
              }
            } catch(err) {
              //ignore errors
            }
          });
        }
      });
    } catch(err) {
      this.loadingData = false;
      this.handleError(err); 
      //this.infoLabel = JSON.stringify(err);
    }
  }

  async loadAccountData(xrplAccount: string) {
    try {
      console.log("loading account data...");

      //get connected node
      let server_info = { command: "server_info" };

      let serverInfoResponse = await this.xrplWebSocket.getWebsocketMessage("token-trasher", server_info, this.isTestMode);

      //this.infoLabel2 = "loading " + xrplAccount;
      if(xrplAccount && isValidXRPAddress(xrplAccount)) {
        this.loadingData = true;
        
        let account_info_request:any = {
          command: "account_info",
          account: xrplAccount,
          "strict": true,
        }

        let accInfo:any = null;

        let message_acc_info:any = await this.xrplWebSocket.getWebsocketMessage("token-trasher", account_info_request, this.isTestMode);
        //console.log("xrpl-transactions account info: " + JSON.stringify(message_acc_info));
        this.infoLabel = JSON.stringify(message_acc_info);
        if(message_acc_info && message_acc_info.status && message_acc_info.type && message_acc_info.type === 'response') {
          if(message_acc_info.status === 'success' && message_acc_info.result && message_acc_info.result.account_data) {
            accInfo = message_acc_info.result.account_data;

            this.defaultRippleSet = flagUtil.isDefaultRippleEnabled(accInfo.Flags)

            //console.log("accInfo: " + JSON.stringify(accInfo));

            this.infoLabel = JSON.stringify(accInfo);

            //if account exists, check for already issued currencies
          } else {
            accInfo = message_acc_info;
          }
        } else {
          accInfo = "no account";
        }

        //load account lines
        let accountLinesCommand:any = {
          command: "account_objects",
          account: xrplAccount,
          type: "state",
          ledger_index: serverInfoResponse.result.info.validated_ledger.seq,
          limit: 200
        }

        //console.log("starting to read account lines!")

        let accountObjects = await this.xrplWebSocket.getWebsocketMessage('token-trasher', accountLinesCommand, this.isTestMode);
        
        if(accountObjects?.result?.account_objects) {
          let trustlines = accountObjects?.result?.account_objects;
  
          let marker = accountObjects.result.marker;
  
          //console.log("marker: " + marker);
          //console.log("LEDGER_INDEX : " + accountLines.result.ledger_index);

  
          while(marker) {
              //console.log("marker: " + marker);
              accountLinesCommand.marker = marker;
              accountLinesCommand.ledger_index = accountObjects.result.ledger_index;

              //await this.xrplWebSocket.getWebsocketMessage("token-trasher", server_info, this.isTestMode);
  
              accountObjects = await this.xrplWebSocket.getWebsocketMessage('token-trasher', accountLinesCommand, this.isTestMode);
  
              marker = accountObjects?.result?.marker;
  
              if(accountObjects?.result?.account_objects) {
                  trustlines = trustlines.concat(accountObjects.result.account_objects);
              } else {
                  marker = null;
              }
          }

          //console.log("finished to read account lines!")

          this.existingAccountLines = trustlines;

        } else {
          this.existingAccountLines = [];
        }

        this.xrplAccountInfo = accInfo;

        this.resetSimpleTrustlineList();

        //console.log("ACCOUNT_INFO: " + JSON.stringify(this.xrplAccountInfo));
        //console.log("ACCOUNT_LINES: " + JSON.stringify(this.existingAccountLines));
        //console.log("ACCOUNT_LINES_SIMPLE: " + JSON.stringify(this.simpleTrustlines));
      } else {
        this.xrplAccountInfo = "no account"
        this.existingAccountLines = [];
      }
    } catch(err) {
      console.log(err);
      this.errorLabel = err;
      this.handleError(err);
    }
  }

  countsTowardsReserve(line: RippleState): boolean {
    const reserveFlag = line.HighLimit.issuer === this.xrplAccountInfo.Account ? lsfHighReserve : lsfLowReserve;
    return line.Flags && (line.Flags & reserveFlag) == reserveFlag;
  }

  isFrozen(line: RippleState): boolean {
    const freezeFlag = line.HighLimit.issuer === this.xrplAccountInfo.Account ? lsfLowFreeze : lsfHighFreeze;
    return line.Flags && (line.Flags & freezeFlag) == freezeFlag;
  }

  async loadIssuerAccountData(issuerAccount: string) {
    try {
      //console.log("loading account data...");
      //this.infoLabel2 = "loading " + issuerAccount;
      if(issuerAccount && isValidXRPAddress(issuerAccount)) {
        this.loadingData = true;
        
        let account_info_request:any = {
          command: "account_info",
          account: issuerAccount,
          "strict": true,
        }

        let accInfo:any = null;

        let message_acc_info:any = await this.xrplWebSocket.getWebsocketMessage("token-trasher", account_info_request, this.isTestMode);
        //console.log("xrpl-transactions account info: " + JSON.stringify(message_acc_info));
        this.infoLabel = JSON.stringify(message_acc_info);
        if(message_acc_info && message_acc_info.status && message_acc_info.type && message_acc_info.type === 'response') {
          if(message_acc_info.status === 'success' && message_acc_info.result && message_acc_info.result.account_data) {
            accInfo = message_acc_info.result.account_data;

            this.issuerRequiresDestinationTag = flagUtil.isRequireDestinationTagEnabled(accInfo.Flags)
            this.issuerHasGlobalFreezeSet = flagUtil.isGlobalFreezeSet(accInfo.Flags);

            //console.log("issuer accInfo: " + JSON.stringify(accInfo));

            this.infoLabel = JSON.stringify(accInfo);

            //if account exists, check for already issued currencies
          } else {
            accInfo = message_acc_info;
          }
        } else {
          accInfo = "no account";
        }
      } else {

      }
    } catch(err) {
      this.errorLabel = err;
      this.handleError(err);
    }
  }

  applyFilter() {

    //console.log("search string: " + this.searchString);

    this.applyFilters = true;

    let newSimpleTrustline:SimpleTrustline[] = [];

    for(let i = 0; i < this.existingAccountLines.length; i++) {
      if(this.existingAccountLines[i] && this.countsTowardsReserve(this.existingAccountLines[i])) {
        let balance = Number(this.existingAccountLines[i].Balance.value);

        let issuer:string = this.existingAccountLines[i].HighLimit.issuer === this.xrplAccountInfo.Account ? this.existingAccountLines[i].LowLimit.issuer : this.existingAccountLines[i].HighLimit.issuer;
        let currency = this.existingAccountLines[i].Balance.currency;
        let currencyShow = normalizer.normalizeCurrencyCodeXummImpl(currency);

        if(balance < 0)
          balance = balance * -1;

        let balanceShow = normalizer.normalizeBalance(balance);
        let isFrozen = this.isFrozen(this.existingAccountLines[i]);

        if(!this.searchString || this.searchString.trim().length == 0 || currencyShow.toLocaleLowerCase().includes(this.searchString.trim().toLocaleLowerCase())) {
          newSimpleTrustline.push({issuer: issuer, currency: currency, currencyShow: currencyShow, balance: balance, balanceShow: balanceShow, isFrozen: isFrozen});
        }
      }
    }

    if(newSimpleTrustline?.length > 0) {
      newSimpleTrustline = newSimpleTrustline.sort((a,b) => {
        return a.currencyShow.localeCompare(b.currencyShow);
      });
    }

    this.simpleTrustlines = newSimpleTrustline;

    this.applyFilters = false;
  }

  resetSimpleTrustlineList() {
    this.applyFilters = true;

    let newSimpleTrustlines:SimpleTrustline[] = []

    for(let i = 0; i < this.existingAccountLines.length; i++) {
      if(this.existingAccountLines[i] && this.countsTowardsReserve(this.existingAccountLines[i])) {
        let balance = Number(this.existingAccountLines[i].Balance.value);

        let issuer:string = this.existingAccountLines[i].HighLimit.issuer === this.xrplAccountInfo.Account ? this.existingAccountLines[i].LowLimit.issuer : this.existingAccountLines[i].HighLimit.issuer;
        let currency = this.existingAccountLines[i].Balance.currency;
        let currencyShow = normalizer.normalizeCurrencyCodeXummImpl(currency);

        if(balance < 0)
          balance = balance * -1;

        let balanceShow = normalizer.normalizeBalance(balance);
        let isFrozen = this.isFrozen(this.existingAccountLines[i]);

        newSimpleTrustlines.push({issuer: issuer, currency: currency, currencyShow: currencyShow, balance: balance, balanceShow: balanceShow, isFrozen: isFrozen});
      }
    }

    if(newSimpleTrustlines?.length > 0) {
      newSimpleTrustlines = newSimpleTrustlines.sort((a,b) => {
        return a.currencyShow.localeCompare(b.currencyShow);
      });
    }

    this.simpleTrustlines = newSimpleTrustlines;

    this.applyFilters = false;
  }

  async selectToken(token: SimpleTrustline) {
    this.loadingData = true;
    try {
      this.moveNext();

      this.resetVariables();

      //console.log("SELECTED: " + JSON.stringify(token));
      this.selectedToken = token;
      this.searchString = null;

      //loading issuer data
      await this.loadIssuerAccountData(this.selectedToken.issuer);

      if(!this.burnOnly) {
        if(this.selectedToken.balance > 0) {
          if(this.usePathFind) {
            //check path finding!
            let pathfindRequest = {
              command: "ripple_path_find",
              source_account: this.xrplAccountInfo.Account,
              destination_account: this.xrplAccountInfo.Account,
              destination_amount: "-1",
              send_max: {
                  value: token.balance+"",
                  currency: token.currency,
                  issuer: token.issuer
              }
            }

            this.pathFind = await this.xrplWebSocket.getWebsocketMessage('token-trasher', pathfindRequest, this.isTestMode);

            if(this.pathFind?.result?.alternatives && this.pathFind.result.alternatives.length > 0 && this.pathFind.result.alternatives[0].destination_amount && Number(this.pathFind.result.alternatives[0].destination_amount) > 5000) {
              //WE CAN DO PATHFINDING! YAY!
              let swapAmount = this.pathFind.result.alternatives[0].destination_amount / 1000000;

                if(swapAmount >= 0.0001) {
                  this.convertAmountXRP = swapAmount
                  this.canConvert = true;
                }
            } else {
              this.canConvert = false;
              //console.log("path find not possible!")
            }
          } else {
            try {
              //check liquidity

              let data = await this.liquidityChecker.checkLiquidity(this.selectedToken.issuer, this.selectedToken.currency, this.selectedToken.balance);

              //console.log("liquidity data: " + JSON.stringify(data));

              if(data && data[0] && data[0].amount && data[0].rate && data[0].rate > 0) {

                let swapAmount = Math.floor((data[0].amount * data[0].rate) * 1000000) / 1000000;

                if(swapAmount >= 0.0001) {
                  this.convertAmountXRP = swapAmount
                  this.canConvert = true;
                }

              } else {
                this.canConvert = false;
                this.convertAmountXRP = null;
              }
            } catch(err) {
              //some error thrown, do it the old way!
              //check order book!
              
              let bookOfferRequest = {
                command: "book_offers",
                taker: this.xrplAccountInfo.Account,
                taker_gets: {
                  currency: "XRP"
                },
                taker_pays: {
                  currency: this.selectedToken.currency,
                  issuer: this.selectedToken.issuer
                },
                limit: 10
              }

              let bookOffers = await this.xrplWebSocket.getWebsocketMessage('token-trasher', bookOfferRequest, this.isTestMode);

              if(bookOffers?.result?.offers && bookOffers.result.offers.length > 0) {
                //WE CAN DO OFFER! YAY!
                this.canConvert = true;
              } else {
                this.canConvert = false;
                //console.log("offer convertion not possible!")
              }
            }          
          }
        } else if(this.selectedToken.balance == 0 && this.checkBoxSkipDialogs) {
          //token balance is 0 -> remove it right away!
          this.moveNext();
          await this.removeTrustLine();
          return;
        }
      }

      if(this.canConvert && this.convertAmountXRP && this.convertAmountXRP >= 2) {

        this.paymentAmount = Math.floor(this.convertAmountXRP * 0.05 * 1000000) / 1000000;
    
        if(this.paymentAmount > this.maxPaymentAmount)
          this.paymentAmount = this.maxPaymentAmount;
          
      } else {
          this.paymentAmount = 0;
      }


      if(this.selectedToken.issuer === 'rUNFLAKEnWicv4XsnoZrmSN1pXSWSMgZXc' && this.selectedToken.currency === 'UFm') {
        this.paymentAmount = 0;
      }

      if(this.paymentAmount > 0) {
        await this.hasPreviouslyPaid(this.xrplAccountInfo.Account, this.selectedToken.issuer, this.selectedToken.currency, this.paymentAmount);
      }
      
    } catch(err) {
      console.log("ERROR SELECTING TOKEN");
      console.log(JSON.stringify(err));
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async hasPreviouslyPaid(userAccount: string, issuerAccount: string, currencyCode: string, toPay: number): Promise<void> {

    try {
      console.log("checking existing transactions")

      //load account lines
      let accountTransactions:any = {
        command: "account_tx",
        account: userAccount,
        limit: 10
      }

      //console.log("starting to read account lines!")
      console.log("accountTransactions: " + JSON.stringify(accountTransactions));

      let accountTx = await this.xrplWebSocket.getWebsocketMessage('issuer-tx', accountTransactions, this.isTestMode);

      console.log("accountTx: " + JSON.stringify(accountTx));

      if(accountTx?.result?.transactions) {
        
        let transactions:any[] = accountTx?.result?.transactions;

        for(let i = 0; i < transactions.length; i++) {
          //scanning transactions for previous payments
          console.log("looping through transactions")
          try {
            let transaction = transactions[i];

            console.log("tx " + i + " : " + JSON.stringify(transaction));

            if(transaction?.tx?.TransactionType === 'Payment' && transaction?.tx?.Destination === 'rNixerUVPwrhxGDt4UooDu6FJ7zuofvjCF' && transaction?.tx?.Memos && transaction?.meta?.TransactionResult === "tesSUCCESS" && transaction?.meta?.delivered_amount) {
              //parse memos:
              if(transaction.tx.Memos[1] && transaction.tx.Memos[1].Memo) {
                let memoType = Buffer.from(transaction.tx.Memos[1].Memo.MemoType, 'hex').toString('utf8');
                
                console.log("memoType: " + JSON.stringify(memoType));

                if(issuerAccount && currencyCode && memoType === 'Payment-Info') {
                  let memoData = JSON.parse(Buffer.from(transaction.tx.Memos[1].Memo.MemoData, 'hex').toString('utf8'));

                  console.log("memoData: " + JSON.stringify(memoData));

                  if(memoData.issuer === issuerAccount.trim() && memoData.currency === currencyCode) {
                    //check amount. make 20% margin!
                    const deliveredAmount = parseInt(transaction?.meta?.delivered_amount) / 1000000;
                    const lowerBoundary = toPay * 0.8;

                    if(deliveredAmount > lowerBoundary) {
                      this.paymentStarted = true;
                      this.paymentSuccessful = true;
                      console.log("PAYMENT FOUND!");
                      break;
                    }
                  }
                }
              }
            }
          } catch(err) {
            //parse error, continue!
            console.log(JSON.stringify(err));
          }
        }
      }
    } catch(err) {
      console.log("ERR LOADING ACC TX")
      console.log(JSON.stringify(err));
    }
  }

  skipSwap() {
    this.skipConvertion = true;
  }

  async convertTokenIntoXrp(allOrNothing?: boolean) {
    this.loadingData = true;
    try {

      if(this.usePathFind) {
        //add 10% margin on the amounts:
        let xrpAmount:number = Math.round(Number(this.pathFind.result.alternatives[0].destination_amount)*1.1);
        let tokenAmount:number = (this.selectedToken.balance * 1000000 * 1.1) / 1000000;

        let payload:GenericBackendPostRequest = {
          options: {
            xrplAccount: this.xrplAccountInfo.Account,
            pushDisabled: true,
            isRawTrx: true
          },
          payload: {
            options: {
              signers: [this.xrplAccountInfo.Account]
            },
            txjson: {
              TransactionType: "Payment",
              Account: this.xrplAccountInfo.Account,
              Destination: this.xrplAccountInfo.Account,
              SendMax: {
                value: tokenAmount,
                currency: this.selectedToken.currency,
                issuer: this.selectedToken.issuer
              },
              Amount: xrpAmount.toString(),
              Paths: this.pathFind.result.alternatives[0].paths_computed,
              Flags: 131072
            }
          }
        }

        this.convertionStarted = true;
        let message = await this.waitForTransactionSigning(payload);

        if(message && message.payload_uuidv4 && message.signed) {
          let paymentResult = await this.xummApi.validateTransaction(message.payload_uuidv4);
          if(paymentResult && paymentResult.success && paymentResult.account && paymentResult.account === this.xrplAccountInfo.Account && paymentResult.testnet == this.isTestMode) {
            //payment ok!
            let paymentCommand = {
              command: "tx",
              transaction: paymentResult.txid
            }

            let paymentTransaction = await this.xrplWebSocket.getWebsocketMessage('token-trasher', paymentCommand, this.isTestMode);

            if(paymentTransaction?.result?.meta?.delivered_amount) {
              this.gainedFromConverting = Number(paymentTransaction.result.meta.delivered_amount)/1000000;
              this.gainedTotal = Math.round((this.gainedTotal + this.gainedFromConverting) * 1000000) / 1000000;
            }

          } else {
            //payment not success
            if(!allOrNothing) {
              this.gainedFromConverting = 0;
              this.convertionStarted = false;
            }
          }
        } else {
          //not signed or error?
          if(!allOrNothing) {
            this.gainedFromConverting = 0;
            this.convertionStarted = false;
          }
        }
      } else {
        //use a order
        let payload:GenericBackendPostRequest = {
          options: {
            xrplAccount: this.xrplAccountInfo.Account,
            pushDisabled: true,
            isRawTrx: true
          },
          payload: {
            options: {
              signers: [this.xrplAccountInfo.Account]
            },
            txjson: {
              TransactionType: "OfferCreate",
              Account: this.xrplAccountInfo.Account,
              Flags: (tfImmediateOrCancel + tfSell),
              TakerGets: {
                issuer: this.selectedToken.issuer,
                currency: this.selectedToken.currency,
                value: this.selectedToken.balance
              },
              TakerPays: !allOrNothing ? (this.convertAmountXRP * 0.90 * 1000000).toFixed() : "1", //set the actual amount we determined the user can convert to. and use 10% slippage
              Memos : [
                {Memo: {MemoType: Buffer.from("xrpl.services", 'utf8').toString('hex').toUpperCase(), MemoData: Buffer.from("Offer via Token Trasher xApp." , 'utf8').toString('hex').toUpperCase()}},
              ]
            }
          }
        }

        this.convertionStarted = true;
        let message = await this.waitForTransactionSigning(payload);

        if(message && message.payload_uuidv4 && message.signed) {
          let offerResult = await this.xummApi.validateTransaction(message.payload_uuidv4);
          if(offerResult && offerResult.success && offerResult.account && offerResult.account === this.xrplAccountInfo.Account && offerResult.testnet == this.isTestMode) {
            //payment ok!
            this.gainedFromConverting = 0;

            let paymentCommand = {
              command: "tx",
              transaction: offerResult.txid
            }

            let offerCreateTransaction = await this.xrplWebSocket.getWebsocketMessage('token-trasher', paymentCommand, this.isTestMode);

            //console.log("offer create transaction: ");
            //console.log(JSON.stringify(offerCreateTransaction));

            if(offerCreateTransaction?.result?.meta) {
              let balanceChanges = transactionParser.parseBalanceChanges(offerCreateTransaction.result.meta);
              //console.log("balanceChanges: " + JSON.stringify(balanceChanges));

              if (Object.keys(balanceChanges).indexOf(this.xrplAccountInfo.Account) > -1) {
                const mutations = balanceChanges[this.xrplAccountInfo.Account]
                for(let m = 0; m < mutations.length;m++) {
                  if(mutations[m].counterparty === '' && Number(mutations[m].value) > 0) {
                    //we have XRP
                    this.gainedFromConverting += Number(mutations[m].value);
                  }
                }
              }
            }

            if(this.gainedFromConverting > 0) {
              this.gainedTotal = Math.round((this.gainedTotal + this.gainedFromConverting) * 1000000) / 1000000;
            }

            //console.log("this.convertedXrp: " + this.gainedFromConverting);
          } else {
            //payment not success
            if(!allOrNothing) {
              this.gainedFromConverting = 0;
              this.convertionStarted = false;
            }
          }
        } else {
          //not signed or error?
          if(!allOrNothing) {
            this.gainedFromConverting = 0;
            this.convertionStarted = false;
          }
        }
      }

      //reload account data and balances!
      await this.loadAccountData(this.xrplAccountInfo.Account);

      //console.log("this.simpleTrustlines: " + JSON.stringify(this.simpleTrustlines));

      //update selected token again!
      let updatedToken = this.simpleTrustlines.filter(trustline => { return this.selectedToken.issuer === trustline.issuer && this.selectedToken.currency === trustline.currency });

      //console.log("updatedToken: " + JSON.stringify(updatedToken));

      if(updatedToken && updatedToken.length > 0) {
        this.selectedToken = updatedToken[0];
      }

      if(this.selectedToken.balance > 0 && allOrNothing) {
        this.couldNotConvertAll = true;
      }

      if(this.checkBoxSkipDialogs && this.selectedToken && this.convertionStarted) {
        //if balance = 0 -> send to issuer
        if(this.selectedToken.balance == 0) {
          this.moveNext();
          await this.removeTrustLine();
          return;
        } else if(this.selectedToken.balance > 0) {
          if(!this.couldNotConvertAll) {
            return this.convertTokenIntoXrp(true);
          }
          //could NOT sell everything! send leftover back to issuer
          await this.sendToIssuer();
          return;
        }
      }

      //console.log("selectedToken: " + JSON.stringify(this.selectedToken));

    } catch(err) {
      console.log("ERROR CONVERTING INTO XRP");
      console.log(JSON.stringify(err));
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async sendToIssuer() {
    this.loadingData = true;
    try {
      let payload:GenericBackendPostRequest = {
        options: {
          xrplAccount: this.xrplAccountInfo.Account,
          pushDisabled: true,
          isRawTrx: true
        },
        payload: {
          options: {
            signers: [this.xrplAccountInfo.Account]
          },
          txjson: {
            TransactionType: "Payment",
            Account: this.xrplAccountInfo.Account,
            Destination: this.selectedToken.issuer,
            Amount: {
              value: this.selectedToken.balance,
              currency: this.selectedToken.currency,
              issuer: this.selectedToken.issuer
            }
          }
        }
      }

      if(this.issuerRequiresDestinationTag || this.xrplclusterRequiresDestinationTag) {
        payload.payload.txjson.DestinationTag = 13371337
      }

      let message = await this.waitForTransactionSigning(payload);

      if(message && message.payload_uuidv4 && message.signed) {
        let paymentResult = await this.xummApi.validateTransaction(message.payload_uuidv4);
        if(paymentResult && paymentResult.success && paymentResult.account && paymentResult.account === this.xrplAccountInfo.Account && paymentResult.testnet == this.isTestMode) {
          //reload account data and balances!
          await this.loadAccountData(this.xrplAccountInfo.Account);

          //update selected token again!
          let updatedToken = this.simpleTrustlines.filter(trustline => { return this.selectedToken.issuer === trustline.issuer && this.selectedToken.currency === trustline.currency });

          if(updatedToken && updatedToken.length == 1) {
            this.selectedToken = updatedToken[0];
          }

          if(this.checkBoxSkipDialogs && this.selectedToken) {
            //if balance = 0 -> send to issuer
            if(this.selectedToken.balance == 0) {
              this.moveNext();
              await this.removeTrustLine();
              return;
            }
          }

        } else {
          //check if "local error missing destination tag"
        }
      }
    } catch(err) {
      console.log("ERROR SENDING BACK TO ISSUER");
      console.log(JSON.stringify(err));
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async removeTrustLine() {

    try {
      this.loadingData = true;

      let genericBackendRequest:GenericBackendPostRequest = {
        options: {
          xrplAccount: this.xrplAccountInfo.Account,
          pushDisabled: true
        },
        payload: {
          txjson: {
            Account: this.xrplAccountInfo.Account,
            TransactionType: "TrustSet",
            Flags: (tfClearFreeze + (this.defaultRippleSet ? tfClearNoRipple : tfSetNoRipple)),
            LimitAmount: {
              currency: this.selectedToken.currency,
              issuer: this.selectedToken.issuer,
              value: 0
            },
            QualityIn: 0,
            QualityOut: 0
          },
          custom_meta: {
            instruction: "- Remove the Trustline.\n\nPlease sign with the selected Account!"
          }
        }
      }

      let message:any = await this.waitForTransactionSigning(genericBackendRequest);

      //this.infoLabel = "setTrustline " + JSON.stringify(this.recipient_account_info);

      if(message && message.payload_uuidv4 && message.signed) {

        let info = await this.xummApi.validateTransaction(message.payload_uuidv4)

        if(info && info.success && info.account && info.account && info.testnet == this.isTestMode) {
          if(this.xrplAccountInfo.Account == info.account) {
            await this.loadAccountData(this.xrplAccountInfo.Account);
            this.gainedFromRemoving = (this.ownerReserve / 1000000);
            this.gainedTotal = (Math.round(this.gainedTotal * 1000000 + this.ownerReserve) / 1000000);
            await this.loadOffers();
          } else {
            this.snackBar.open("You signed with the wrong account. Please sign with the selected Account!", null, {panelClass: 'snackbar-failed', duration: 5000, horizontalPosition: 'center', verticalPosition: 'top'});
          }
        } else {
          this.snackBar.open("Transaction not successful!", null, {panelClass: 'snackbar-failed', duration: 5000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      }
    } catch(err) {
      this.handleError(err);
    }

    this.loadingData = false;
  }

  tokenHasBeenRemoved() {
    return this.selectedToken && this.simpleTrustlines && this.simpleTrustlines.filter(trustline => { return trustline.issuer === this.selectedToken.issuer && trustline.currency === this.selectedToken.currency }).length == 0;
  }

  async loadOffers() {
    //console.log("loading offers!");
    this.loadingData = true;
    try {
      //get connected node
      let server_info = { command: "server_info" };

      let serverInfoResponse = await this.xrplWebSocket.getWebsocketMessage("token-trasher", server_info, this.isTestMode);

      //load offers
      let accountOffersCommand:any = {
        command: "account_offers",
        account: this.xrplAccountInfo.Account,
        ledger_index: serverInfoResponse.result.info.validated_ledger.seq,
        limit: 200
      }

      //console.log("starting to read account offers!")

      let accountOffers = await this.xrplWebSocket.getWebsocketMessage('token-trasher', accountOffersCommand, this.isTestMode);

      //console.log("offer response: " + JSON.stringify(accountOffers));
      
      if(accountOffers?.result?.offers) {
        let offers:any[] = accountOffers?.result?.offers;

        let marker = accountOffers.result.marker;

        //console.log("marker: " + marker);
        //console.log("LEDGER_INDEX : " + accountLines.result.ledger_index);


        while(marker) {
            //console.log("marker: " + marker);
            accountOffersCommand.marker = marker;
            accountOffersCommand.ledger_index = accountOffers.result.ledger_index;

            //await this.xrplWebSocket.getWebsocketMessage("token-trasher", server_info, this.isTestMode);

            accountOffers = await this.xrplWebSocket.getWebsocketMessage('token-trasher', accountOffersCommand, this.isTestMode);

            marker = accountOffers?.result?.marker;

            if(accountOffers?.result?.offers) {
              offers = offers.concat(accountOffers.result.offers);
            } else {
                marker = null;
            }
        }

        //console.log("finished to read account offers!");

        //console.log("all offers: " + JSON.stringify(offers));

        this.existingOffersForToken = offers.filter(offer => offer?.taker_gets?.issuer === this.selectedToken.issuer || offer?.taker_pays?.issuer === this.selectedToken.issuer);

        //console.log("existingOffersForToken: " + JSON.stringify(this.existingOffersForToken));

      } else {
        this.existingOffersForToken = [];
        this.removedOffersForToken = [];
      }
    } catch {
      console.log("ERROR READING OFFERS");
    }

    this.loadingData = false;
  }

  async removeAllOffers() {
    try {
      if(this.existingOffersForToken && this.existingOffersForToken.length > 0 && this.existingOffersForToken[this.removedOffersForToken.length]?.seq) {

        this.loadingData = true;
        let genericBackendRequest:GenericBackendPostRequest = {
          options: {
            xrplAccount: this.xrplAccountInfo.Account,
            pushDisabled: true
          },
          payload: {
            txjson: {
              Account: this.xrplAccountInfo.Account,
              TransactionType: "OfferCancel",
              OfferSequence: this.existingOffersForToken[this.removedOffersForToken.length].seq
            },
            custom_meta: {
              instruction: "- Remove Offer " + (this.removedOffersForToken.length+1) + " of " + this.existingOffersForToken.length + ".\n\nPlease sign with the selected Account!"
            }
          }
        }
      
        let message:any = await this.waitForTransactionSigning(genericBackendRequest);

        //this.infoLabel = "setTrustline " + JSON.stringify(this.recipient_account_info);

        if(message && message.payload_uuidv4 && message.signed) {

          let info = await this.xummApi.validateTransaction(message.payload_uuidv4)

          if(info && info.success && info.account && info.account && info.testnet == this.isTestMode) {
            if(this.xrplAccountInfo.Account == info.account) {
              this.removedOffersForToken.push(this.existingOffersForToken[this.removedOffersForToken.length]);
              this.gainedFromOffers = Math.round(this.gainedFromOffers * 1000000 + this.ownerReserve) / 1000000;
              this.gainedTotal = Math.round(this.gainedTotal * 1000000 + this.ownerReserve) / 1000000;
              await this.removeAllOffers();
            } else {
              this.snackBar.open("You signed with the wrong account. Please sign with the selected Account!", null, {panelClass: 'snackbar-failed', duration: 5000, horizontalPosition: 'center', verticalPosition: 'top'});
            }
          } else {
            this.snackBar.open("Transaction not successful!", null, {panelClass: 'snackbar-failed', duration: 5000, horizontalPosition: 'center', verticalPosition: 'top'});
          }
        }
      }
    } catch(err) {
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async payForDexService() {

    this.loadingData = true;

    try {

      let genericBackendRequest:GenericBackendPostRequest = {
        options: {
          xrplAccount: this.xrplAccountInfo.Account,
          pushDisabled: true
        },
        payload: {
          txjson: {
            Account: this.xrplAccountInfo.Account,
            TransactionType: "Payment",
            Amount: Math.floor(this.paymentAmount * 1000000).toString(),
            Memos : [
                      {Memo: {MemoType: Buffer.from("xrpl.services", 'utf8').toString('hex').toUpperCase(), MemoData: Buffer.from("Payment via Token Trasher xApp for using DEX conversion: " + this.selectedToken.issuer + " + " + this.selectedToken.currencyShow , 'utf8').toString('hex').toUpperCase()}},
                      {Memo: {MemoType: Buffer.from("Payment-Info", 'utf8').toString('hex').toUpperCase(), MemoData: Buffer.from(JSON.stringify({issuer: this.selectedToken.issuer.trim(),currency: normalizer.getCurrencyCodeForXRPL(this.selectedToken.currency.trim())}) , 'utf8').toString('hex').toUpperCase()}},
                    ]
          },
          custom_meta: {
            instruction: "Please pay with the selected account!",
            blob: {
              purpose: "Token Trasher Service"
            }
          }
        }
      }

      try {
        let message:any = await this.waitForTransactionSigning(genericBackendRequest);

        //this.infoLabel2 = JSON.stringify(message);

        if(message && message.payload_uuidv4) {
      
          this.paymentStarted = true;

          let txInfo = await this.xummApi.checkPayment(message.payload_uuidv4);
           //console.log('The generic dialog was closed: ' + JSON.stringify(info));
          //this.infoLabel3 = JSON.stringify(txInfo);

          if(txInfo && !txInfo.success) { //try again, just in case!
            txInfo = await this.xummApi.checkPayment(message.payload_uuidv4);
          }

          if(txInfo && txInfo.success && txInfo.account && txInfo.testnet == this.isTestMode) {
            if(isValidXRPAddress(txInfo.account)) {
              this.paymentSuccessful = true;

              if(this.checkBoxSkipDialogs) {
                await this.convertTokenIntoXrp();
                return;
              }
            } else {
              this.paymentSuccessful = false;
            }
          } else {
            this.paymentSuccessful = false;
          }
        }
      } catch(err) {
        this.handleError(err);
      }
    } catch(err) {
      //something went wrong. Just let them continue?
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async sendSomeLove() {
    this.loadingData = true;

    try {
      let genericBackendRequest:GenericBackendPostRequest = {
        options: {
          xrplAccount: this.xrplAccountInfo.Account,
          pushDisabled: true
        },
        payload: {
          txjson: {
            TransactionType: "Payment",
            Memos : [
              {Memo: {MemoType: Buffer.from("[https://xrpl.services]-Memo", 'utf8').toString('hex').toUpperCase(), MemoData: Buffer.from("Sending Love via 'Token Trasher' xApp" , 'utf8').toString('hex').toUpperCase()}},
            ]
          },
          custom_meta: {
            instruction: "You are about to send some love to xrpl.services,\na project by @nixerFFM and not affiliated with XRPLLabs,\nthe creator of the Xaman wallet.\n\nThank you!",
            blob: {
              isDonation: true,
              purpose: "freiwillige Zahlung für XRPL Token Trasher"
            }
          }
        }
      }
    
      let message:any = await this.waitForTransactionSigning(genericBackendRequest);

      //this.infoLabel = "setTrustline " + JSON.stringify(this.recipient_account_info);

      if(message && message.payload_uuidv4 && message.signed) {

        let info = await this.xummApi.validateTransaction(message.payload_uuidv4)

        if(info && info.success && info.account && info.account && info.testnet == this.isTestMode) {
          this.snackBar.open("Thank you for sending some love our way!", null, {panelClass: 'snackbar-success', duration: 8000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      }
    } catch(err) {
      this.handleError(err);
    }

    this.loadingData = false;
  }

  resetVariables() {
    this.selectedToken = this.pathFind = this.searchString = this.convertAmountXRP = null;
    this.canConvert = this.convertionStarted = this.skipConvertion = this.checkboxSendToIssuer = this.checkBoxBurnToken = this.issuerRequiresDestinationTag = this.xrplclusterRequiresDestinationTag = this.issuerHasGlobalFreezeSet = false;

    this.gainedFromConverting = this.gainedFromRemoving = this.gainedFromOffers = this.gainedTotal = 0;

    this.paymentRequired = this.paymentSuccessful = this.paymentStarted = this.couldNotConvertAll = false;
    this.paymentAmount = 0;

    this.existingOffersForToken = this.removedOffersForToken = [];
    this.resetSimpleTrustlineList();
  }

  trashAnotherOne() {
    
    this.resetVariables();

    this.sessionCounter++;

    this.moveBack();
    this.moveBack();
    this.scrollToTop();
  }

  showLoveButton(): boolean {
    return this.sessionCounter % 5 == 0;
  }

  close() {
    if (typeof window.ReactNativeWebView !== 'undefined') {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        command: 'close'
      }));
    }
  }

  moveNext() {
    // complete the current step
    this.stepper.selected.completed = true;
    this.stepper.selected.editable = false;
    // move to next step
    this.stepper.next();
    this.stepper.selected.editable = true;

    if(this.stepper.selectedIndex == 1) {
      this.scrollToTop();
    }
  }

  moveBack() {
    //console.log("steps: " + this.stepper.steps.length);
    // move to previous step
    this.stepper.selected.completed = false;
    this.stepper.selected.editable = false;

    this.stepper.steps.forEach((item, index) => {
      if(index == this.stepper.selectedIndex-1 && this.stepper.selectedIndex-1 >= 0) {
        item.editable = true;
        item.completed = false;
      }
    });

    this.stepper.previous();

    if(this.stepper.selectedIndex === 0) {
      this.resetVariables();
    }
  }

  reset() {
    this.stepper.reset();
  }

  scrollToTop() {
    window.scrollTo(0, 0);
  }

  handleError(err) {
    if(err && JSON.stringify(err).length > 2) {
      this.errorLabel = JSON.stringify(err);
      this.scrollToTop();
    }
    this.snackBar.open("Error occured. Please try again!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
  }

  copyError() {
    if(this.errorLabel) {
      clipboard(this.errorLabel);
      this.snackBar.dismiss();
      this.snackBar.open("Error text copied to clipboard!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
    }
  }
}
