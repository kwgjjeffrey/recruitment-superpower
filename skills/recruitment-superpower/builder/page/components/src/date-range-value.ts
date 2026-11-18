/** Omni date-range protocol: preset key or inclusive YYYY-MM-DD..YYYY-MM-DD. */
export const DATE_RANGE_PRESETS = [
 ['last_7d','Last 7 days'],['last_30d','Last 30 days'],['last_90d','Last 90 days'],
 ['this_month','This month'],['last_month','Last month'],['this_quarter','This quarter'],['ytd','Year to date'],
] as const;
export const DATE_RANGE_PATTERN='^(?:all|'+DATE_RANGE_PRESETS.map(([key])=>key).join('|')+'|[0-9]{4}-[0-9]{2}-[0-9]{2}\\.\\.[0-9]{4}-[0-9]{2}-[0-9]{2})$';
export function customDateRange(value:string) {
 const match=/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(value);
 if(!match)return undefined;
 const [,from,to]=match;
 for(const day of [from,to]){
  const date=new Date(day+'T12:00:00Z');
  if(day<'0001-01-01'||!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==day)throw new Error('Choose valid calendar dates.');
 }
 if(from>to)throw new Error('The start date must not follow the end date.');
 return {from,to};
}
export function displayDateRange(value:string,timeZone='Asia/Shanghai',now=new Date()) {
 const custom=customDateRange(value);if(custom)return custom;
 if(value==='all'||!value)return undefined;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
 const end=new Date(get('year'),get('month')-1,get('day'),12),start=new Date(end);
 switch(value){
  case 'last_7d':start.setDate(start.getDate()-6);break;
  case 'last_30d':start.setDate(start.getDate()-29);break;
  case 'last_90d':start.setDate(start.getDate()-89);break;
  case 'this_month':start.setDate(1);break;
  case 'last_month':start.setDate(1);start.setMonth(start.getMonth()-1);end.setDate(0);break;
  case 'this_quarter':start.setDate(1);start.setMonth(Math.floor(start.getMonth()/3)*3);break;
  case 'ytd':start.setMonth(0,1);break;
  default:throw new Error('Choose a date range or a supported preset.');
 }
 return {from:calendarDate(start),to:calendarDate(end)};
}
export const calendarDate=(day:Date)=>`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
