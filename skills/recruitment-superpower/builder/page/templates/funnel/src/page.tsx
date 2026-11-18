import React from 'react';
import {mountPage,usePageContext} from '@recruitment/page';
import {PageShell} from '@recruitment/page/ui';
import {MetricReport} from '@recruitment/page/viz/metrics';
import {report} from './page.viz';
import './style.css';
export const mount=mountPage(ApplicationFunnel);
function ApplicationFunnel(){
 const context=usePageContext();
 return <PageShell title={context.page.title}>
  <MetricReport definition={report}/>
  <p className="mt-6 text-xs text-muted-foreground">One Application per metric and group. Round means the order of completed interviews; cancelled arrangements do not consume a round. 5+ includes every completed interview from the fifth onward. Passed means a current positive recommendation. Optional steps can be skipped, so adjacent counts are not a conversion rate. Job and owner are current; corrected results restate the report. Offers and departments are not included yet.</p>
 </PageShell>;
}
