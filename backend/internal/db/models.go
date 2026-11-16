package db

// Persistence models for the accounts / enrollment / token-rotation design.
//
// Rules that span rows (a sub-account's parent must be a user, passwords are
// user-only, a computer has at most one active refresh family) are enforced in
// the service layer; only single-row rules are CHECK constraints here.
//
// Foreign keys (and therefore ON DELETE CASCADE) are only enforced by SQLite
// when the connection enables them, e.g. DSN "data/ccgui.db?_foreign_keys=on".
//
// References from activity/audit records to tokens use NO ACTION, not CASCADE:
// deleting a token that records still point at fails, so evidence is never
// erased as a side effect. NO ACTION (checked at end of statement) rather than
// RESTRICT (checked immediately) so deleting a whole account still cascades.
//
// Association fields (Account, Family, ...) are pointers: nil unless preloaded,
// and they exist only to generate foreign keys. Set the *ID fields when writing.

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AccountKind string

const (
	AccountKindUser     AccountKind = "user"
	AccountKindComputer AccountKind = "computer"
	AccountKindService  AccountKind = "service"
)

type DeviceType string

const (
	DeviceTypeComputer DeviceType = "computer"
	DeviceTypeTurtle   DeviceType = "turtle"
	DeviceTypePocket   DeviceType = "pocket"
)

type RefreshTokenState string

const (
	// Issued, never presented.
	RefreshTokenIssued RefreshTokenState = "issued"
	// Presented once; a child was issued.
	RefreshTokenUsed RefreshTokenState = "used"
	// Superseded before use (lost-response re-rotation) or revoked with its family.
	RefreshTokenDead RefreshTokenState = "dead"
)

type EnrollmentStatus string

const (
	EnrollmentPending  EnrollmentStatus = "pending"
	EnrollmentApproved EnrollmentStatus = "approved"
	EnrollmentDenied   EnrollmentStatus = "denied"
	// Credential issued; kept until expiry so a repeated Claim can be answered.
	EnrollmentClaimed EnrollmentStatus = "claimed"
)

type SecurityEventType string

const (
	SecurityEventRefreshReuse        SecurityEventType = "refresh_reuse"
	SecurityEventIPMismatch          SecurityEventType = "ip_mismatch"
	SecurityEventFingerprintMismatch SecurityEventType = "fingerprint_mismatch"
	SecurityEventDuplicateWebsocket  SecurityEventType = "duplicate_websocket"
	SecurityEventTerminate           SecurityEventType = "terminate"
	SecurityEventDiskAttached        SecurityEventType = "disk_attached"
	SecurityEventLocalInput          SecurityEventType = "local_input"
	SecurityEventUncleanRestart      SecurityEventType = "unclean_restart"
	SecurityEventFileHashChanged     SecurityEventType = "file_hash_changed"
)

type IncidentStatus string

const (
	IncidentOpen     IncidentStatus = "open"
	IncidentReviewed IncidentStatus = "reviewed"
)

type BranchVerdict string

const (
	BranchUnknown     BranchVerdict = "unknown"
	BranchLikelyLegit BranchVerdict = "likely_legit"
	BranchLikelyThief BranchVerdict = "likely_thief"
	// Reviewed and cleared: records under this branch are no longer tainted.
	BranchTrusted BranchVerdict = "trusted"
)

// UUIDKey gives a model a text UUID primary key, generated on create.
// Exported because GORM ignores unexported embedded structs.
type UUIDKey struct {
	ID string `gorm:"primaryKey;type:text"`
}

func (m *UUIDKey) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	return nil
}

// ---- Identity ----

// Account is the principal. Users are top-level; computer and service
// accounts are sub-accounts owned by exactly one user.
type Account struct {
	UUIDKey
	Kind       AccountKind `gorm:"type:text;not null;index;check:chk_accounts_kind,kind IN ('user','computer','service')"`
	ParentID   *string     `gorm:"type:text;index;check:chk_accounts_parent,(kind = 'user') = (parent_id IS NULL)"`
	Parent     *Account    `gorm:"foreignKey:ParentID;constraint:OnDelete:CASCADE"`
	Name       string      `gorm:"not null"`
	DisabledAt *time.Time
	CreatedAt  time.Time `gorm:"not null"`
	UpdatedAt  time.Time `gorm:"not null"`
}

func (Account) TableName() string { return "accounts" }

// Computer holds the current identity of a Computer account's device.
// The hard fields (CCComputerID, DeviceType, Advanced) are compared on refresh.
type Computer struct {
	AccountID    string     `gorm:"primaryKey;type:text"`
	Account      *Account   `gorm:"constraint:OnDelete:CASCADE"`
	CCComputerID int        `gorm:"not null"`
	DeviceType   DeviceType `gorm:"type:text;not null;check:chk_computers_device_type,device_type IN ('computer','turtle','pocket')"`
	Advanced     bool       `gorm:"not null"`
	Label        *string
	LastSeenAt   *time.Time
	LastIP       *string
}

func (Computer) TableName() string { return "computers" }

// ---- Credentials ----

// Password is a user's login. 1:1 with user accounts.
type Password struct {
	AccountID    string    `gorm:"primaryKey;type:text"`
	Account      *Account  `gorm:"constraint:OnDelete:CASCADE"`
	Username     string    `gorm:"uniqueIndex;not null"`
	PasswordHash string    `gorm:"not null"` // argon2id
	UpdatedAt    time.Time `gorm:"not null"`
}

func (Password) TableName() string { return "passwords" }

// UserAPIKey is a long-lived personal key. User accounts only, 1:many.
type UserAPIKey struct {
	UUIDKey
	AccountID  string   `gorm:"type:text;not null;index"`
	Account    *Account `gorm:"constraint:OnDelete:CASCADE"`
	Name       string   `gorm:"not null"`
	Hash       string   `gorm:"uniqueIndex;not null"`
	LastUsedAt *time.Time
	ExpiresAt  *time.Time
	CreatedAt  time.Time `gorm:"not null"`
}

func (UserAPIKey) TableName() string { return "api_keys" }

// RefreshFamily is one chain of refresh tokens: a single enrollment
// (computer/service) or a single login session (user). Re-enrolling revokes
// the old family and starts a new one, so a computer has one active family.
type RefreshFamily struct {
	UUIDKey
	AccountID    string    `gorm:"type:text;not null;index"`
	Account      *Account  `gorm:"constraint:OnDelete:CASCADE"`
	BoundIP      *string   // nil = not IP-bound (browser sessions)
	CreatedAt    time.Time `gorm:"not null"`
	RevokedAt    *time.Time
	RevokeReason *string
}

func (RefreshFamily) TableName() string { return "refresh_families" }

// RefreshToken is one node in a family's rotation tree. A token presented
// again after its child (or the child's access token) was used is a fork:
// reuse detection, revocation, and the taint root for an incident.
type RefreshToken struct {
	UUIDKey
	FamilyID        string            `gorm:"type:text;not null;index"`
	Family          *RefreshFamily    `gorm:"constraint:OnDelete:CASCADE"`
	ParentID        *string           `gorm:"type:text;index"` // nil for generation 0
	Parent          *RefreshToken     `gorm:"foreignKey:ParentID;constraint:OnDelete:CASCADE"`
	Generation      int               `gorm:"not null"`
	Hash            string            `gorm:"uniqueIndex;not null"`
	State           RefreshTokenState `gorm:"type:text;not null;check:chk_refresh_tokens_state,state IN ('issued','used','dead')"`
	IssuedAt        time.Time         `gorm:"not null"`
	UsedAt          *time.Time
	UsedIP          *string
	UsedUserAgent   *string
	UsedFingerprint *string `gorm:"type:text"` // JSON snapshot reported with the refresh
}

func (RefreshToken) TableName() string { return "refresh_tokens" }

// AccessToken is short-lived and issued alongside a refresh token.
// FirstUsedAt lets the "child never used" rule cover the access token too.
type AccessToken struct {
	UUIDKey
	AccountID         string         `gorm:"type:text;not null;index"`
	Account           *Account       `gorm:"constraint:OnDelete:CASCADE"`
	FamilyID          string         `gorm:"type:text;not null;index"`
	Family            *RefreshFamily `gorm:"constraint:OnDelete:CASCADE"`
	IssuedByRefreshID string         `gorm:"type:text;not null;index"`
	IssuedByRefresh   *RefreshToken  `gorm:"foreignKey:IssuedByRefreshID;constraint:OnDelete:NO ACTION"`
	Hash              string         `gorm:"uniqueIndex;not null"`
	ExpiresAt         time.Time      `gorm:"not null;index"`
	FirstUsedAt       *time.Time
	// Set in the same transaction that revokes the family or disables the
	// account, so a request only checks this row.
	RevokedAt *time.Time
	CreatedAt time.Time `gorm:"not null"`
}

func (AccessToken) TableName() string { return "access_tokens" }

// ---- Enrollment ----

// Enrollment is a pending device-flow Enrollment (or re-Enrollment when
// AccountID points at an existing computer account at approval time).
type Enrollment struct {
	UUIDKey
	DeviceCodeHash       string           `gorm:"uniqueIndex;not null"`
	UserCode             string           `gorm:"uniqueIndex;not null"`
	Status               EnrollmentStatus `gorm:"type:text;not null;check:chk_enrollments_status,status IN ('pending','approved','denied','claimed')"`
	RequesterIP          string           `gorm:"not null"`
	ReportedCCComputerID int              `gorm:"not null"`
	ReportedLabel        *string
	ReportedFingerprint  *string        `gorm:"type:text"`       // JSON
	AccountID            *string        `gorm:"type:text;index"` // set on approval: new or existing account
	Account              *Account       `gorm:"constraint:OnDelete:CASCADE"`
	ApprovedByID         *string        `gorm:"type:text"`
	ApprovedBy           *Account       `gorm:"foreignKey:ApprovedByID;constraint:OnDelete:SET NULL"`
	FamilyID             *string        `gorm:"type:text"` // set on claim; repeated claims re-rotate this family
	Family               *RefreshFamily `gorm:"constraint:OnDelete:SET NULL"`
	ExpiresAt            time.Time      `gorm:"not null;index"`
	CreatedAt            time.Time      `gorm:"not null"`
}

func (Enrollment) TableName() string { return "enrollments" }

// ---- Activity (everything carries access_token_id for taint lookups) ----

// ClientLog is a log entry shipped by a client. Taint uses AccessTokenID
// lineage and ReceivedAt, never the client-supplied ClientTime.
type ClientLog struct {
	ID            uint64       `gorm:"primaryKey;autoIncrement"`
	AccountID     string       `gorm:"type:text;not null;index:idx_client_logs_account_received"`
	Account       *Account     `gorm:"constraint:OnDelete:CASCADE"`
	AccessTokenID string       `gorm:"type:text;not null;index"`
	AccessToken   *AccessToken `gorm:"constraint:OnDelete:NO ACTION"`
	ReceivedAt    time.Time    `gorm:"not null;index:idx_client_logs_account_received"`
	ClientTime    time.Time    `gorm:"not null"`
	Level         int          `gorm:"not null"`
	Message       string       `gorm:"not null"`
	Attrs         string       `gorm:"type:text;not null"` // JSON object
}

func (ClientLog) TableName() string { return "client_logs" }

// WSConnection records each websocket session; used for online history,
// duplicate-connection detection, and incident evidence.
type WSConnection struct {
	UUIDKey
	AccountID      string       `gorm:"type:text;not null;index"`
	Account        *Account     `gorm:"constraint:OnDelete:CASCADE"`
	AccessTokenID  string       `gorm:"type:text;not null;index"`
	AccessToken    *AccessToken `gorm:"constraint:OnDelete:NO ACTION"`
	IP             string       `gorm:"not null"`
	ConnectedAt    time.Time    `gorm:"not null"`
	DisconnectedAt *time.Time
	CloseReason    *string
}

func (WSConnection) TableName() string { return "ws_connections" }

// WSPush records which connection a server→client push went to, so a push
// to a tainted connection shows what a thief may have received.
type WSPush struct {
	ID           uint64        `gorm:"primaryKey;autoIncrement"`
	ConnectionID string        `gorm:"type:text;not null;index"`
	Connection   *WSConnection `gorm:"constraint:OnDelete:CASCADE"`
	Route        int           `gorm:"not null"`
	SentAt       time.Time     `gorm:"not null"`
}

func (WSPush) TableName() string { return "ws_pushes" }

// ---- Security ----

type SecurityEvent struct {
	UUIDKey
	AccountID      string            `gorm:"type:text;not null;index:idx_security_events_account_occurred"`
	Account        *Account          `gorm:"constraint:OnDelete:CASCADE"`
	Type           SecurityEventType `gorm:"type:text;not null;index"`
	OccurredAt     time.Time         `gorm:"not null;index:idx_security_events_account_occurred"` // server time
	IP             *string
	AccessTokenID  *string `gorm:"type:text;index"`
	RefreshTokenID *string `gorm:"type:text;index"`
	Details        *string `gorm:"type:text"` // JSON
}

func (SecurityEvent) TableName() string { return "security_events" }

// Incident marks a refresh-token fork. Everything done with access tokens
// issued by ForkRefreshToken or its descendants is tainted until a branch is
// marked trusted. Taint is computed at query time; records are never mutated.
type Incident struct {
	UUIDKey
	AccountID          string         `gorm:"type:text;not null;index"`
	Account            *Account       `gorm:"constraint:OnDelete:CASCADE"`
	ForkRefreshTokenID string         `gorm:"type:text;not null;uniqueIndex"`
	ForkRefreshToken   *RefreshToken  `gorm:"constraint:OnDelete:NO ACTION"`
	DetectedAt         time.Time      `gorm:"not null"`
	WindowStart        time.Time      `gorm:"not null"` // fork token's IssuedAt
	WindowEnd          *time.Time     // revocation time
	Status             IncidentStatus `gorm:"type:text;not null;check:chk_incidents_status,status IN ('open','reviewed')"`
}

func (Incident) TableName() string { return "incidents" }

// IncidentBranch is one child subtree of the fork token.
type IncidentBranch struct {
	IncidentID          string        `gorm:"primaryKey;type:text"`
	Incident            *Incident     `gorm:"constraint:OnDelete:CASCADE"`
	FirstRefreshTokenID string        `gorm:"primaryKey;type:text"`
	FirstRefreshToken   *RefreshToken `gorm:"constraint:OnDelete:NO ACTION"`
	Verdict             BranchVerdict `gorm:"type:text;not null;check:chk_incident_branches_verdict,verdict IN ('unknown','likely_legit','likely_thief','trusted')"`
	Evidence            *string       `gorm:"type:text"` // JSON: IPs, fingerprints, user agents, websocket overlap
}

func (IncidentBranch) TableName() string { return "incident_branches" }
