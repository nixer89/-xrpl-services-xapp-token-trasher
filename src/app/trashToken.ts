import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { XummService } from './services/xumm.service'
import { XRPLWebsocket } from './services/xrplWebSocket';
import { Observable, Subject, Subscription } from 'rxjs';
import { GenericBackendPostRequest, SimpleTrustline, TransactionValidation, TrustLine } from './utils/types';
import * as flagUtil from './utils/flagutils';
import { MatStepper } from '@angular/material/stepper';
import * as normalizer from './utils/normalizers';
import { isValidXRPAddress } from 'src/app/utils/utils';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatSnackBar } from '@angular/material/snack-bar';
import { webSocket, WebSocketSubject} from 'rxjs/webSocket';
import { XummTypes } from 'xumm-sdk';
import { TypeWriter } from './utils/TypeWriter';
import * as clipboard from 'copy-to-clipboard';
import { XummPostPayloadBodyJson } from 'xumm-sdk/dist/src/types'
import * as transactionParser from 'ripple-lib-transactionparser'

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
  existingAccountLines:TrustLine[] = [];
  simpleTrustlines:SimpleTrustline[] = [];

  selectedToken:SimpleTrustline = null;

  usePathFind:boolean = false;
  pathFind:any = null;

  originalOwnerCount:number = null;

  searchString:string = null;

  canConvert:boolean = false;
  convertionStarted:boolean = false;
  convertedXrp:number = null;

  defaultRippleSet:boolean = false;

  checkboxSendToIssuer:boolean = false;

  transactionSuccessfull: Subject<void> = new Subject<void>();

  isTestMode:boolean = false;

  accountReserve:number = 10000000;
  ownerReserve:number = 2000000;

  sessionCounter:number = 1;

  @Input()
  ottChanged: Observable<any>;

  @Input()
  themeChanged: Observable<any>;

  private ottReceived: Subscription;
  private themeReceived: Subscription;

  themeClass = 'dark-theme';
  backgroundColor = '#000000';

  loadingData:boolean = false;

  websocket: WebSocketSubject<any>;

  infoLabel:string = null;
  infoLabel2:string = null;
  infoLabel3:string = null;

  errorLabel:string = null;

  title: string = "XRPL Services xApp";
  tw: TypeWriter

  @ViewChild('stepper') stepper: MatStepper;

  async ngOnInit(): Promise<void> {

    this.loadingData = true;

    //await this.loadAccountData("r9N4v3cWxfh4x6yUNjxNy3DbWUgbzMBLdk");

    this.originalOwnerCount = this.xrplAccountInfo?.OwnerCount;

    this.ottReceived = this.ottChanged.subscribe(async ottData => {
      this.infoLabel = "ott received: " + JSON.stringify(ottData);
      console.log("ottReceived: " + JSON.stringify(ottData));

      if(ottData) {

        this.infoLabel = JSON.stringify(ottData);
        
        this.isTestMode = ottData.nodetype === 'TESTNET';
        //this.isTestMode = true;

        this.infoLabel2 = "changed mode to testnet: " + this.isTestMode;

        if(ottData && ottData.account && ottData.accountaccess == 'FULL') {
          await this.loadAccountData(ottData.account);
          this.originalOwnerCount = this.xrplAccountInfo?.OwnerCount;

          try {
            //read origin data
            if(ottData.issuer && ottData.currency) {
              //pre selected token!
              let preselect = this.simpleTrustlines.filter(trustline => { return ottData.issuer === trustline.issuer && ottData.currency === trustline.currency });

              if(preselect && preselect.length == 1) {
                await this.selectToken(preselect[0])
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

    //add event listeners
    if (typeof window.addEventListener === 'function') {
      window.addEventListener("message", event => this.handleOverlayEvent(event));
    }
    
    if (typeof document.addEventListener === 'function') {
      document.addEventListener("message", event => this.handleOverlayEvent(event));
    }

    await this.loadFeeReserves();

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
    this.accountReserve = feeSetting?.result?.node["ReserveBase"];
    this.ownerReserve = feeSetting?.result?.node["ReserveIncrement"];

    //console.log("resolved accountReserve: " + this.accountReserve);
    //console.log("resolved ownerReserve: " + this.ownerReserve);
  }

  async handleOverlayEvent(event:any) {
    try {
      if(event && event.data) {
        let eventData = JSON.parse(event.data);

        if(eventData && eventData.method == "payloadResolved" && eventData.reason == "DECLINED") {
            //user closed without signing
            this.loadingData = false;
        }
      }
    } catch(err) {
      //ignore errors
    }
  }

  async waitForTransactionSigning(payloadRequest: GenericBackendPostRequest): Promise<any> {
    this.loadingData = true;
    //this.infoLabel = "Opening sign request";
    let xummResponse:XummTypes.XummPostPayloadResponse;
    try {
        payloadRequest.payload.options = {
          expire: 2,
          forceAccount: isValidXRPAddress(payloadRequest.payload.txjson.Account+"")
        }

        //console.log("sending xumm payload: " + JSON.stringify(xummPayload));
        xummResponse = await this.xummApi.submitPayload(payloadRequest);
        //this.infoLabel = "Called xumm successfully"
        //this.infoLabel = (JSON.stringify(xummResponse));
        if(!xummResponse || !xummResponse.uuid) {
          this.snackBar.open("Error contacting XUMM backend", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
          return null;
        }        
    } catch (err) {
        //console.log(JSON.stringify(err));
        this.snackBar.open("Could not contact XUMM backend", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        return null;
    }

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
      if(this.websocket && !this.websocket.closed) {
        this.websocket.unsubscribe();
        this.websocket.complete();
      }

      return new Promise( (resolve, reject) => {

        this.websocket = webSocket(xummResponse.refs.websocket_status);
        this.websocket.asObservable().subscribe(async message => {
            //console.log("message received: " + JSON.stringify(message));
            //this.infoLabel = "message received: " + JSON.stringify(message);

            if((message.payload_uuidv4 && message.payload_uuidv4 === xummResponse.uuid) || message.expired || message.expires_in_seconds <= 0) {

              if(this.websocket) {
                this.websocket.unsubscribe();
                this.websocket.complete();
              }
              
              setTimeout( () => resolve(message), 500);
            }
        });
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
      this.infoLabel2 = "loading " + xrplAccount;
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

            console.log("accInfo: " + JSON.stringify(accInfo));

            this.infoLabel = JSON.stringify(accInfo);

            //if account exists, check for already issued currencies
          } else {
            accInfo = message_acc_info;
          }
        } else {
          accInfo = "no account";
        }

        //load balance data
        let accountLinesCommand:any = {
          command: "account_lines",
          account: xrplAccount,
          ledger_index: "validated",
          limit: 1000
        }

        console.log("starting to read account lines!")

        let accountLines = await this.xrplWebSocket.getWebsocketMessage('token-trasher', accountLinesCommand, this.isTestMode);
        
        if(accountLines?.result?.lines) {
          let trustlines = accountLines?.result?.lines;
  
          let marker = accountLines.result.marker
  
          console.log("marker: " + marker);
  
          while(marker) {
              console.log("marker: " + marker);
              accountLinesCommand.marker = marker;
              accountLinesCommand.ledger_index = accountLines.result.ledger_index;
  
              accountLines = await this.xrplWebSocket.getWebsocketMessage('token-trasher', accountLinesCommand, this.isTestMode);
  
              marker = accountLines?.result?.marker;
  
              if(accountLines?.result?.lines) {
                  trustlines = trustlines.concat(accountLines.result.lines);
              } else {
                  marker = null;
              }
          }

          console.log("finished to read account lines!")

          this.existingAccountLines = trustlines;
          this.simpleTrustlines = [];

          for(let i = 0; i < this.existingAccountLines.length; i++) {
            let issuer:string = this.existingAccountLines[i].account;
            let balance = Number(this.existingAccountLines[i].balance);
            let currency = this.existingAccountLines[i].currency;
            let currencyShow = normalizer.normalizeCurrencyCodeXummImpl(currency);

            if(balance < 0)
              balance = balance * -1;

            let balanceShow = normalizer.normalizeBalance(balance);

            this.simpleTrustlines.push({issuer: issuer, currency: currency, currencyShow: currencyShow, balance: balance, balanceShow: balanceShow});
          }
        } else {
          this.existingAccountLines = [];
        }

        this.xrplAccountInfo = accInfo;

        if(this.simpleTrustlines?.length > 0) {
          this.simpleTrustlines = this.simpleTrustlines.sort((a,b) => {
            return a.currencyShow.localeCompare(b.currencyShow);
          });
        }

        console.log("ACCOUNT_INFO: " + JSON.stringify(this.xrplAccountInfo));
        console.log("ACCOUNT_LINES: " + JSON.stringify(this.existingAccountLines));
        console.log("ACCOUNT_LINES_SIMPLE: " + JSON.stringify(this.simpleTrustlines));
      } else {
        this.xrplAccountInfo = "no account"
        this.existingAccountLines = [];
      }
    } catch(err) {
      this.errorLabel = JSON.stringify(err);
      this.handleError(err);
    }
  }

  applyFilter() {

    console.log("search string: " + this.searchString);

    let newSimpleTrustline:SimpleTrustline[] = [];

    for(let i = 0; i < this.existingAccountLines.length; i++) {
      let issuer:string = this.existingAccountLines[i].account;
      let balance = Number(this.existingAccountLines[i].balance);
      let currency = this.existingAccountLines[i].currency;
      let currencyShow = normalizer.normalizeCurrencyCodeXummImpl(currency);

      if(balance < 0)
        balance = balance * -1;

      let balanceShow = normalizer.normalizeBalance(balance);

      if(!this.searchString || this.searchString.trim().length == 0 || currencyShow.toLocaleLowerCase().includes(this.searchString.trim().toLocaleLowerCase())) {
        newSimpleTrustline.push({issuer: issuer, currency: currency, currencyShow: currencyShow, balance: balance, balanceShow: balanceShow});
      }
    }

    if(newSimpleTrustline?.length > 0) {
      newSimpleTrustline = newSimpleTrustline.sort((a,b) => {
        return a.currencyShow.localeCompare(b.currencyShow);
      });
    }

    this.simpleTrustlines = newSimpleTrustline;
  }

  async selectToken(token: SimpleTrustline) {
    this.loadingData = true;
    try {
      this.moveNext();
      console.log("SELECTED: " + JSON.stringify(token));
      this.selectedToken = token;
      this.searchString = null;

      this.simpleTrustlines = []

      for(let i = 0; i < this.existingAccountLines.length; i++) {
        let issuer:string = this.existingAccountLines[i].account;
        let balance = Number(this.existingAccountLines[i].balance);
        let currency = this.existingAccountLines[i].currency;
        let currencyShow = normalizer.normalizeCurrencyCodeXummImpl(currency);

        if(balance < 0)
          balance = balance * -1;

        let balanceShow = normalizer.normalizeBalance(balance);

        this.simpleTrustlines.push({issuer: issuer, currency: currency, currencyShow: currencyShow, balance: balance, balanceShow: balanceShow});
      }

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
            this.canConvert = true;
          } else {
            console.log("path find not possible!")
          }
        } else {
          //check path finding!
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
            //WE CAN DO PATHFINDING! YAY!
            this.canConvert = true;
          } else {
            console.log("offer convertion not possible!")
          }
        }
      }

      //now lets check balance again and move left over token to the issuer
    } catch(err) {
      console.log("ERROR SELECTING TOKEN");
      console.log(JSON.stringify(err));
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async convertTokenIntoXrp() {
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
              forceAccount: true,
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
              this.convertedXrp = Number(paymentTransaction.result.meta.delivered_amount)/1000000;
            }

          } else {
            //payment not success
            this.convertedXrp = null;
            this.convertionStarted = false;
          }
        } else {
          //not signed or error?
          this.convertedXrp = null;
            this.convertionStarted = false;
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
              forceAccount: true,
            },
            txjson: {
              TransactionType: "OfferCreate",
              Account: this.xrplAccountInfo.Account,
              Flags: 655360,
              TakerGets: {
                issuer: this.selectedToken.issuer,
                currency: this.selectedToken.currency,
                value: this.selectedToken.balance
              },
              TakerPays: "1"
            }
          }
        }

        this.convertionStarted = true;
        let message = await this.waitForTransactionSigning(payload);

        if(message && message.payload_uuidv4 && message.signed) {
          let offerResult = await this.xummApi.validateTransaction(message.payload_uuidv4);
          if(offerResult && offerResult.success && offerResult.account && offerResult.account === this.xrplAccountInfo.Account && offerResult.testnet == this.isTestMode) {
            //payment ok!
            this.convertedXrp = 0;

            let paymentCommand = {
              command: "tx",
              transaction: offerResult.txid
            }

            let offerCreateTransaction = await this.xrplWebSocket.getWebsocketMessage('token-trasher', paymentCommand, this.isTestMode);

            console.log("offer create transaction: ");
            console.log(JSON.stringify(offerCreateTransaction));

            if(offerCreateTransaction?.result?.meta) {
              let balanceChanges = transactionParser.parseBalanceChanges(offerCreateTransaction.result.meta);
              console.log("balanceChanges: " + JSON.stringify(balanceChanges));

              if (Object.keys(balanceChanges).indexOf(this.xrplAccountInfo.Account) > -1) {
                const mutations = balanceChanges[this.xrplAccountInfo.Account]
                for(let m = 0; m < mutations.length;m++) {
                  if(mutations[m].counterparty === '' && Number(mutations[m].value) > 0) {
                    //we have XRP
                    this.convertedXrp += Number(mutations[m].value);
                  }
                }
              }
            }

            console.log("this.convertedXrp: " + this.convertedXrp);
          } else {
            //payment not success
            this.convertedXrp = null;
            this.convertionStarted = false;
          }
        } else {
          //not signed or error?
          this.convertedXrp = null;
          this.convertionStarted = false;
        }
      }

      //reload account data and balances!
      await this.loadAccountData(this.xrplAccountInfo.Account);

      console.log("this.simpleTrustlines: " + JSON.stringify(this.simpleTrustlines));

      //update selected token again!
      let updatedToken = this.simpleTrustlines.filter(trustline => { return this.selectedToken.issuer === trustline.issuer && this.selectedToken.currency === trustline.currency });

      console.log("updatedToken: " + JSON.stringify(updatedToken));

      if(updatedToken && updatedToken.length > 0) {
        this.selectedToken = updatedToken[0];
      }

      console.log("selectedToken: " + JSON.stringify(this.selectedToken));

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
            forceAccount: true
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
          Flags: 2097152 + (this.defaultRippleSet ? 262144 : 131072),
          LimitAmount: {
            currency: this.selectedToken.currency,
            issuer: this.selectedToken.issuer,
            value: 0
          }
        },
        custom_meta: {
          instruction: "- Remove the Trustline.\n\nPlease sign with the selected Account!"
        }
      }
    }

    try {
      let message:any = await this.waitForTransactionSigning(genericBackendRequest);

      //this.infoLabel = "setTrustline " + JSON.stringify(this.recipient_account_info);

      if(message && message.payload_uuidv4 && message.signed) {

        let info = await this.xummApi.validateTransaction(message.payload_uuidv4)

        if(info && info.success && info.account && info.account && info.testnet == this.isTestMode) {
          if(this.xrplAccountInfo.Account == info.account) {
            await this.loadAccountData(this.xrplAccountInfo.Account);
          } else {
            this.snackBar.open("You signed with the wrong account. Please sign with Recipient Account!", null, {panelClass: 'snackbar-failed', duration: 5000, horizontalPosition: 'center', verticalPosition: 'top'});
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

  async makeDonation() {
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
              {Memo: {MemoType: Buffer.from("[https://xrpl.services]-Memo", 'utf8').toString('hex').toUpperCase(), MemoData: Buffer.from("Donation via 'Token Trasher' xApp" , 'utf8').toString('hex').toUpperCase()}},
            ]
          },
          custom_meta: {
            instruction: "You are about to donate to xrpl.services,\na project by @nixerFFM and not affiliated with XRPLLabs,\nthe creator of the XUMM wallet.\n\nThank you for your donation!",
            blob: {
              isDonation: true,
              purpose: "freiwillige Spende"
            }
          }
        }
      }
    
      let message:any = await this.waitForTransactionSigning(genericBackendRequest);

      //this.infoLabel = "setTrustline " + JSON.stringify(this.recipient_account_info);

      if(message && message.payload_uuidv4 && message.signed) {

        let info = await this.xummApi.validateTransaction(message.payload_uuidv4)

        if(info && info.success && info.account && info.account && info.testnet == this.isTestMode) {
          this.snackBar.open("Thank you for your donation!", null, {panelClass: 'snackbar-success', duration: 8000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      }
    } catch(err) {
      this.handleError(err);
    }

    this.loadingData = false;
  }

  trashAnotherOne() {
    
    this.selectedToken = this.pathFind = this.searchString = this.convertedXrp = null;
    this.canConvert = this.convertionStarted = this.checkboxSendToIssuer = false;

    this.originalOwnerCount = this.xrplAccountInfo?.OwnerCount;

    this.sessionCounter++;

    this.moveBack();
    this.moveBack();
    this.scrollToTop();
  }

  showDonation(): boolean {
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
    })

    this.stepper.previous();
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
