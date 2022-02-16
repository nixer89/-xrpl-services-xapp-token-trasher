  import { LedgerExchange } from './ledgerExchange'


  export class CheckLiquidity {

    private static _instance: CheckLiquidity;

    private constructor() { }

    public static get Instance(): CheckLiquidity
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }
  
    async checkLiquidity(issuer:string, currency: string, amount: number): Promise<any> {

      try {

          const pair = {issuer: issuer, currency: currency, displayName: currency};
          
          let data = await Promise.all(
                await Promise.all([amount].map(async a => {
                        
                  const Check = new LedgerExchange(pair)
                  Check.initialize();
                  const r = await Check.getLiquidity('buy', a);
        
                  return {
                    name: pair.displayName,
                    amount: a,
                    rate: r.rate,
                    errors: r.errors
                  }
                }
              )
            )
          );

          return data;

      } catch(err) {
        console.log(err)
        return null;
      }
    }
}