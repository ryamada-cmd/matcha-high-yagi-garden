import React from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import HarvestProcessingPage from '../src/pages/HarvestProcessingPage';
import '../src/styles.css';
import '../src/features.css';
import '../src/layout-fixes.css';
import '../src/harvest-processing.css';
import '../src/unified-ui.css';
import '../src/ui-refresh.css';
import '../src/ui-cohesion.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
 <BrowserRouter>
  <div className="app-shell" data-qa="synthetic-harvest-only">
   <main><HarvestProcessingPage/></main>
  </div>
 </BrowserRouter>
);
