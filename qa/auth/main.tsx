import React from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import App from '../../src/App'
import '../../src/styles.css'
import '../../src/layout-fixes.css'
import '../../src/unified-ui.css'
import '../../src/astryx-ui.css'

const route=new URLSearchParams(window.location.search).get('route')||'/'
createRoot(document.getElementById('root')!).render(
 <React.StrictMode>
  <MemoryRouter initialEntries={[route]}><App/></MemoryRouter>
 </React.StrictMode>
)
