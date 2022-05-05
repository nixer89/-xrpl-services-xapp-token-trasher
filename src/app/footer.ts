import { Component } from '@angular/core';
import packageInfo from '../../package.json';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.html'
})
export class FooterComponent {

  public appVersion:string = packageInfo.version;

  constructor() { }

  openTermsAndConditions() {
    if (typeof window.ReactNativeWebView !== 'undefined') {
      //this.infoLabel = "opening sign request";
      window.ReactNativeWebView.postMessage(JSON.stringify({
        command: "openBrowser",
        url: "https://xrpl.services/terms"
      }));
    }
  }

  openPrivacyPolicy() {
    if (typeof window.ReactNativeWebView !== 'undefined') {
      //this.infoLabel = "opening sign request";
      window.ReactNativeWebView.postMessage(JSON.stringify({
        command: "openBrowser",
        url: "https://xrpl.services/privacy"
      }));
    }
  }

}
