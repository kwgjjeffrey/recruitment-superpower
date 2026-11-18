import React from 'react';
import {AgGridReact} from 'ag-grid-react';
import {AllCommunityModule,ModuleRegistry,themeQuartz,type ColDef,type GridApi,type IDatasource,type ICellRendererParams} from 'ag-grid-community';
import {Button} from '../ui';
import {Tooltip,TooltipTrigger,TooltipContent} from '../tooltip';
import type {MetricDefinition} from './metric-report';
import type {MetricState} from './metric-source';
import {GROUP_SIZE} from './metric-query';
ModuleRegistry.registerModules([AllCommunityModule]);
type Row={id:string;label:string;block:number;[key:string]:unknown};
const theme=themeQuartz.withParams({backgroundColor:'#ffffff',foregroundColor:'#24332e',headerBackgroundColor:'#edf3ee',headerTextColor:'#24332e',pinnedRowBackgroundColor:'#edf3ee',borderColor:'#c9d6cc',accentColor:'#275947',fontFamily:'system-ui',fontSize:13,headerFontSize:12,rowHeight:44,headerHeight:62});
type Props={definition:MetricDefinition;params:Record<string,unknown>;data?:MetricState;scope:string;epoch:number;loading:boolean;loadBlock:(block:number)=>Promise<MetricState>;onSort:(metric:string,direction:'asc'|'desc')=>void;onOpen:(element:HTMLElement,metric:string,group:string)=>void};
export function MetricGrid(props:Props){
 const latest=React.useRef(props);latest.current=props;
 const api=React.useRef<GridApi<Row>|null>(null),requestedPage=React.useRef<number|null>(null);
 const initialPage=React.useRef(Number(props.params.groupPage));
 const initialState=React.useRef({sort:{sortModel:props.params.sortMetric?[{colId:String(props.params.sortMetric),sort:props.params.sortDirection as 'asc'|'desc'}]:[]}});
 const datasource=React.useMemo<IDatasource>(()=>{
  let alive=true;
  return {getRows(request){
   if(!alive){request.failCallback();return;}
   const block=Math.floor(request.startRow/GROUP_SIZE);requestedPage.current=block;
   latest.current.loadBlock(block).then(data=>{
    if(!alive)return;
    request.successCallback(data.groups.map(g=>({id:g.key,label:g.label,block,...g.counts})),data.groupTotal);
   },()=>{if(alive)request.failCallback();});
  },destroy(){alive=false;}};
 },[props.scope,props.epoch]);
 const columns=React.useMemo<ColDef<Row>[]>(()=>[
  {field:'label',headerName:'Group',pinned:'left',width:300,minWidth:180,sortable:false,cellRenderer:({value,node}:ICellRendererParams<Row>)=>node.rowPinned?<strong>Sum</strong>:value?<Tooltip><TooltipTrigger asChild><span className="metric-group-label" tabIndex={0}>{String(value)}</span></TooltipTrigger><TooltipContent className="metric-group-tooltip">{String(value)}</TooltipContent></Tooltip>:null},
  ...props.definition.metrics.map(metric=>({field:metric.key,colId:metric.key,headerName:metric.label,width:140,minWidth:110,sortable:true,sortingOrder:['desc','asc',null] as ('desc'|'asc'|null)[],
   cellStyle:(cell:any)=>{
    if(cell.node.rowPinned)return {backgroundColor:'#edf3ee',fontWeight:700};
    const maximum=latest.current.data?.columnMax[metric.key]??0,value=Number(cell.value??0);
    return {fontWeight:400,backgroundColor:value&&maximum?`color-mix(in srgb, #275947 ${6+40*value/maximum}%, #ffffff)`:'#ffffff'};
   },
   cellRenderer:({value,data,node}:ICellRendererParams<Row>)=>value===undefined?null:<Button variant="ghost" className="metric-count" aria-label={`${metric.label}: ${value} · ${data?.label}`} title={metric.description} disabled={latest.current.loading} onClick={event=>latest.current.onOpen(event.currentTarget,metric.key,node.rowPinned?'':String(data?.id))}>{Number(value).toLocaleString('en-US')}</Button>,
   suppressKeyboardEvent:(event:any)=>Boolean((event.event.target as HTMLElement)?.closest('button')),
  })),
 ],[props.definition]);
 const pinned=React.useMemo(()=>props.data?[{id:'__sum__',label:'Sum',block:-1,...Object.fromEntries(props.data.totals.map(m=>[m.metric,m.count]))}]:[],[props.data?.totals]);
 React.useEffect(()=>{
  const grid=api.current;if(!grid)return;
  const state=grid.getColumnState().find(c=>c.sort);
  const metric=String(props.params.sortMetric),direction=props.params.sortDirection as 'asc'|'desc';
  if((state?.colId??'')!==metric||(metric&&state?.sort!==direction))grid.applyColumnState({defaultState:{sort:null},state:metric?[{colId:metric,sort:direction}]:[]});
 },[props.params.sortMetric,props.params.sortDirection]);
 React.useEffect(()=>{
  const page=Number(props.params.groupPage);
  if(requestedPage.current===page){requestedPage.current=null;return;}
  if(api.current&&props.data?.groupTotal)api.current.ensureIndexVisible(Math.min(page*GROUP_SIZE,props.data.groupTotal-1),'top');
 },[props.params.groupPage]);
 React.useEffect(()=>{api.current?.refreshCells({force:true});},[props.loading,props.data?.columnMax]);
 React.useEffect(()=>{
  if(!props.data)return;
  const actual=new Map(props.data.groups.map(g=>[g.key,g]));
  api.current?.forEachNode(node=>{const row=actual.get(node.id??'');if(row&&node.data)node.setData({...node.data,label:row.label,...row.counts});});
 },[props.data?.groups]);
 return <div className="metric-grid metric-matrix" aria-label="Application funnel matrix"><AgGridReact<Row>
  theme={theme} initialState={initialState.current} columnDefs={columns} defaultColDef={{resizable:true,wrapHeaderText:true,suppressMovable:true}}
  rowModelType="infinite" datasource={datasource} cacheBlockSize={GROUP_SIZE} maxBlocksInCache={6} maxConcurrentDatasourceRequests={1} rowBuffer={2}
  infiniteInitialRowCount={Math.max(1,(initialPage.current+1)*GROUP_SIZE)} getRowId={p=>p.data.id} pinnedTopRowData={pinned}
  suppressColumnVirtualisation suppressMultiSort tooltipShowDelay={250} enableBrowserTooltips={false}
  onGridReady={({api:grid})=>{api.current=grid;if(initialPage.current)grid.ensureIndexVisible(initialPage.current*GROUP_SIZE,'top');}}
  onGridSizeChanged={({api:grid,clientWidth})=>grid.setColumnWidths([{key:'label',newWidth:clientWidth<600?200:300}])}
  onSortChanged={({api:grid})=>{const sorted=grid.getColumnState().find(c=>c.sort);latest.current.onSort(sorted?.colId??'',sorted?.sort==='asc'?'asc':'desc');}}
  getRowStyle={p=>p.node.rowPinned?{backgroundColor:'#edf3ee',fontWeight:600}:undefined}
  overlayNoRowsTemplate="<span>No activity matches these filters.</span>" />
 </div>;
}
