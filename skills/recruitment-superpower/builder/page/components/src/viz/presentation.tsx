import React from 'react';
import {Card as StandardCard} from '../ui';
import {AutoTable as StandardTable} from '../read';
import type {Node} from './definition';
import type {FieldSchema} from '../contracts/schema';
export function Card({children,className,...props}:React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`viz-block ${className??''}`}><StandardCard>{children}</StandardCard></div>;
}
export const fmt={money:(v:unknown,decimals=0)=>`¥${Number(v??0).toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals})}`,pct:(v:unknown)=>`${(Number(v??0)*100).toFixed(1)}%`};
export function AutoTable({node,rows}:{node:Node;rows:Record<string,unknown>[]}) {
  function convert(n:Node):FieldSchema{return {type:n.type,description:n.description,...(n.properties?{properties:Object.fromEntries(Object.entries(n.properties).map(([k,v])=>[k,convert(v)]))}:{}),...(n.items?{items:convert(n.items)}:{}),...(n.labels?{ui:{label:n.description,labels:n.labels}}:{})};}
  return <StandardTable field={convert(node)} rows={rows} empty="No data for these filters"/>;
}
