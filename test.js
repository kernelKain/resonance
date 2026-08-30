import React from 'react';
import { renderToString } from 'react-dom/server';
import { Tooltip } from '@base-ui/react';

function App() {
  return React.createElement(Tooltip.Provider, null, 
    React.createElement(Tooltip.Root, null, 
      React.createElement(Tooltip.Trigger, { render: React.createElement("span", null) }, "Test")
    )
  );
}

console.log(renderToString(React.createElement(App)));
