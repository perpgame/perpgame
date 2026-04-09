import { createContext, useContext, useState } from 'react'

const HeaderContext = createContext(null)

export function HeaderProvider({ children }) {
  const [rightContent, setRightContent] = useState(null)
  return (
    <HeaderContext.Provider value={{ rightContent, setRightContent }}>
      {children}
    </HeaderContext.Provider>
  )
}

export function useHeaderContext() {
  return useContext(HeaderContext)
}
