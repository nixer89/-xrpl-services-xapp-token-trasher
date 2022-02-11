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

  searchString:string = null;

  canDoPathFind:boolean = false;

  transactionSuccessfull: Subject<void> = new Subject<void>();

  isTestMode:boolean = false;

  accountReserve:number = 10000000;
  ownerReserve:number = 2000000;

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

    await this.loadAccountData("r9N4v3cWxfh4x6yUNjxNy3DbWUgbzMBLdk");

    this.ottReceived = this.ottChanged.subscribe(async ottData => {
      this.infoLabel = "ott received: " + JSON.stringify(ottData);
      console.log("ottReceived: " + JSON.stringify(ottData));

      if(ottData) {
        return;

        this.infoLabel = JSON.stringify(ottData);
        
        this.isTestMode = ottData.nodetype === 'TESTNET';
        //this.isTestMode = true;

        this.infoLabel2 = "changed mode to testnet: " + this.isTestMode;

        if(ottData && ottData.account && ottData.accountaccess == 'FULL') {
          await this.loadAccountData(ottData.account);
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
        console.log("ACCOUNT_LINES: " + this.existingAccountLines);
        console.log("ACCOUNT_LINES_SIMPLE: " + this.simpleTrustlines);
      } else {
        this.xrplAccountInfo = "no account"
        this.existingAccountLines = [];
      }
    } catch(err) {
      this.errorLabel = JSON.stringify(err);
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
    console.log("SELECTED: " + JSON.stringify(token));
    //check path finding!
    let pathfindRequest = {
      command: "ripple_path_find",
      source_account: this.xrplAccountInfo.Account,
      source_currencies: [{
          currency: token.currency
      }],
      destination_account: this.xrplAccountInfo.Account,
      destination_amount: "-1",
      send_max: {
          value: token.balance,
          currency: token.currency,
          issuer: token.issuer
      }
    }

    let pathfindRespone = await this.xrplWebSocket.getWebsocketMessage('token-trasher', pathfindRequest, this.isTestMode);

    if(pathfindRespone?.result?.alternatives && pathfindRespone.result.alternatives.length > 0) {
      //WE CAN DO PATHFINDING! YAY!
      
    }
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
