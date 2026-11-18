/** Omni range picker: retain its value and two-click draft, use Base UI overlay. */
import {useEffect,useState} from 'react';
import {DayPicker,type DateRange as DayRange} from 'react-day-picker';
import {enUS} from 'react-day-picker/locale';
import {CalendarDays,ChevronLeft,ChevronRight} from 'lucide-react';
import {Popover,PopoverTrigger,PopoverContent,PopoverTitle} from './popover';
import {Button,controlCls,cn} from './ui';
import {DATE_RANGE_PRESETS,displayDateRange,calendarDate} from './date-range-value';
function CalendarChevron({className,orientation}:{className?:string;orientation?:'up'|'down'|'left'|'right'}){
 const Icon=orientation==='left'?ChevronLeft:ChevronRight;return <Icon className={className} size={18} aria-hidden="true"/>;
}
export function DateRangePicker({id,value,onChange,disabled=false,label='Period',timeZone='Asia/Shanghai'}:{id?:string;value:string;onChange:(value:string)=>void;disabled?:boolean;label?:string;timeZone?:string}){
 const [open,setOpen]=useState(false),[compact,setCompact]=useState(false),[draft,setDraft]=useState<DayRange>();
 useEffect(()=>{const media=matchMedia('(max-width:720px)'),update=()=>setCompact(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 let range;try{range=displayDateRange(value,timeZone);}catch{/* Failed accepted values remain inspectable with Reset available. */}
 const selected=range?{from:new Date(range.from+'T12:00:00'),to:new Date(range.to+'T12:00:00')}:undefined;
 const preset=DATE_RANGE_PRESETS.find(([key])=>key===value);
 const text=value==='all'?'All dates':preset?preset[1]:range?`${range.from} – ${range.to}`:'Choose dates';
 const commit=(next:string)=>{onChange(next);setOpen(false);};
 return <Popover open={open} onOpenChange={next=>{setOpen(next);if(next)setDraft(undefined);}}>
  <PopoverTrigger id={id} disabled={disabled} aria-label={label} title={range?`${range.from} – ${range.to} · ${timeZone}`:text} render={<Button variant="outline" className={cn(controlCls,'date-range-trigger')}/>}><CalendarDays size={15} aria-hidden="true"/><span>{text}</span></PopoverTrigger>
  <PopoverContent className="date-range-popup" aria-label="Date range"><PopoverTitle className="sr-only">Date range</PopoverTitle>
   <div className="daterange-presets"><Button variant="ghost" className={cn('daterange-preset',value==='all'&&'daterange-preset-selected')} onClick={()=>commit('all')}>All dates</Button>{DATE_RANGE_PRESETS.map(([key,title])=><Button key={key} variant="ghost" className={cn('daterange-preset',value===key&&'daterange-preset-selected')} onClick={()=>commit(key)}>{title}</Button>)}</div>
   <div><DayPicker mode="range" numberOfMonths={compact?1:2} locale={enUS} defaultMonth={selected?.from} selected={draft??selected} autoFocus
    onDayClick={day=>{if(!draft?.from||draft.to){setDraft({from:day});return;}const a=draft.from<=day?draft.from:day,z=draft.from<=day?day:draft.from;setDraft({from:a,to:z});commit(`${calendarDate(a)}..${calendarDate(z)}`);}}
    components={{Chevron:CalendarChevron}} className="daterange-calendar"/>
    <p className="date-range-help">{draft?.from?`${calendarDate(draft.from)} · Choose an end date`:'Choose a start and end date'} · {timeZone}</p>
   </div>
  </PopoverContent>
 </Popover>;
}
