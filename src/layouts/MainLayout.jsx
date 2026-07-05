import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const MainLayout = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar className="mobile-hidden" />
      
      {isMobileMenuOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999 }} onClick={() => setIsMobileMenuOpen(false)}>
          <div style={{ width: '250px', height: '100%', backgroundColor: 'var(--bg-sidebar)' }} onClick={e => e.stopPropagation()}>
             <Sidebar isMobile onClose={() => setIsMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%' }}>
        <Header onOpenMenu={() => setIsMobileMenuOpen(true)} />
        <main className="mobile-main-padding" style={{ flex: 1, overflowY: 'auto', padding: '2rem', backgroundColor: 'var(--bg-primary)' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 130px)' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
