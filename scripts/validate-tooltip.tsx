import React from 'react';
import { renderToString } from 'react-dom/server';
import { Tooltip } from '@base-ui/react';

const Test = () => (
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger render={<span />}>
        Test
      </Tooltip.Trigger>
    </Tooltip.Root>
  </Tooltip.Provider>
);

console.log(renderToString(<Test />));
