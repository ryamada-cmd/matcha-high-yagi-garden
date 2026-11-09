// Playwright-only price master: never touches the user's actual product data.
type QAProduct = {
 id:string; sku:string; productName:string; category:string; brandName:string;
 janCode:string; netContent:number; contentUnit:string; packageType:string;
 standardPriceYen:number; wholesalePriceYen:number; retailPriceYen:number;
 otherPriceYen:number; packagingCostYen:number; status:'ACTIVE'|'INACTIVE';
 note:string; createdAt:string; updatedAt:string;
}
const products:QAProduct[]=[
 {id:'qa-product-a',sku:'QA-MATCHA-30',productName:'架空抹茶 30g',category:'抹茶',brandName:'QA',janCode:'',netContent:30,contentUnit:'g',packageType:'缶',standardPriceYen:3800,wholesalePriceYen:2500,retailPriceYen:3800,otherPriceYen:3200,packagingCostYen:150,status:'ACTIVE',note:'',createdAt:'',updatedAt:''},
 {id:'qa-product-b',sku:'QA-HOJICHA-50',productName:'架空ほうじ茶 50g',category:'ほうじ茶',brandName:'QA',janCode:'',netContent:50,contentUnit:'g',packageType:'袋',standardPriceYen:1200,wholesalePriceYen:800,retailPriceYen:1200,otherPriceYen:900,packagingCostYen:100,status:'ACTIVE',note:'',createdAt:'',updatedAt:''},
 {id:'qa-product-c',sku:'QA-INACTIVE',productName:'非販売品（架空）',category:'抹茶',brandName:'QA',janCode:'',netContent:1,contentUnit:'g',packageType:'袋',standardPriceYen:0,wholesalePriceYen:0,retailPriceYen:0,otherPriceYen:0,packagingCostYen:0,status:'INACTIVE',note:'',createdAt:'',updatedAt:''},
];
export async function loadProducts(){return products.map(x=>({...x}))}
export async function saveProduct(input:QAProduct){
 const at=products.findIndex(x=>x.id===input.id);
 if(at<0)throw Error('架空商品が見つかりません');
 products[at]={...input};
 (window as any).__qa_price_save={...input};
 return input.id;
}

export async function deleteProduct(id:string){
 const at=products.findIndex(x=>x.id===id);
 if(at<0)throw Error('架空商品が見つかりません');
 products.splice(at,1);
 (window as any).__qa_price_delete=id;
}
