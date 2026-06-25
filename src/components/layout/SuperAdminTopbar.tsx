export default function SuperAdminTopbar({ toggleMobileMenu }: { toggleMobileMenu?: () => void }) {
  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {toggleMobileMenu && (
          <button className="hamburger-btn" onClick={toggleMobileMenu}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="20" height="20">
              <path d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
        )}
        <div>
          <div className="ptitle">Super Admin</div>
          <div className="pcrumb">Manage all platform data</div>
        </div>
      </div>
    </div>
  )
}
