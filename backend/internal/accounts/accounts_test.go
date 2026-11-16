package accounts_test

import (
	"errors"
	"slices"
	"testing"

	"ehedges.net/ccgui/backend/internal/accounts"
	"ehedges.net/ccgui/backend/internal/db"
	"ehedges.net/ccgui/backend/internal/db/dbtest"
)

func newService(t *testing.T) *accounts.Service {
	t.Helper()
	return accounts.New(dbtest.Open(t))
}

func mustCreateUser(t *testing.T, svc *accounts.Service, name string) *db.Account {
	t.Helper()
	user, err := svc.CreateUser(t.Context(), name)
	if err != nil {
		t.Fatalf("CreateUser(%q): %v", name, err)
	}
	return user
}

func mustCreateSub(t *testing.T, svc *accounts.Service, parentID, name string) *db.Account {
	t.Helper()
	sub, err := svc.CreateSubAccount(t.Context(), parentID, name, db.AccountKindComputer)
	if err != nil {
		t.Fatalf("CreateSubAccount(%q): %v", name, err)
	}
	return sub
}

func TestCreateUserAndSubAccount(t *testing.T) {
	svc := newService(t)

	user := mustCreateUser(t, svc, "foo-user")
	if user.ID == "" || user.Kind != db.AccountKindUser || user.ParentID != nil {
		t.Fatalf("user = %+v, want an ID, kind user, no parent", user)
	}

	sub, err := svc.CreateSubAccount(t.Context(), user.ID, "turtle-01", db.AccountKindComputer)
	if err != nil {
		t.Fatalf("CreateSubAccount: %v", err)
	}
	if sub.Kind != db.AccountKindComputer || sub.ParentID == nil || *sub.ParentID != user.ID {
		t.Fatalf("sub = %+v, want kind computer with parent %s", sub, user.ID)
	}
}

func TestCreateSubAccountRejectsInvalidParent(t *testing.T) {
	svc := newService(t)
	user := mustCreateUser(t, svc, "foo-user")
	computer := mustCreateSub(t, svc, user.ID, "turtle-01")
	disabled := mustCreateUser(t, svc, "disabled-user")
	if err := svc.DisableAccount(t.Context(), disabled.ID); err != nil {
		t.Fatal(err)
	}

	cases := map[string]string{
		"parent is a computer": computer.ID,
		"parent is disabled":   disabled.ID,
		"parent is missing":    "no-such-account",
	}
	for name, parentID := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := svc.CreateSubAccount(t.Context(), parentID, "turtle-02", db.AccountKindComputer)
			if !errors.Is(err, accounts.ErrInvalidParent) {
				t.Fatalf("got %v, want ErrInvalidParent", err)
			}
		})
	}
}

func TestCreateSubAccountRejectsInvalidKind(t *testing.T) {
	svc := newService(t)
	user := mustCreateUser(t, svc, "foo-user")

	for _, kind := range []db.AccountKind{db.AccountKindUser, "robot"} {
		t.Run(string(kind), func(t *testing.T) {
			_, err := svc.CreateSubAccount(t.Context(), user.ID, "turtle-01", kind)
			if !errors.Is(err, accounts.ErrInvalidKind) {
				t.Fatalf("got %v, want ErrInvalidKind", err)
			}
		})
	}
}

func TestCreateAccountRejectsShortName(t *testing.T) {
	svc := newService(t)

	if _, err := svc.CreateUser(t.Context(), "short"); !errors.Is(err, accounts.ErrInvalidName) {
		t.Errorf("CreateUser: got %v, want ErrInvalidName", err)
	}

	user := mustCreateUser(t, svc, "foo-user")
	if _, err := svc.CreateSubAccount(t.Context(), user.ID, "short", db.AccountKindComputer); !errors.Is(err, accounts.ErrInvalidName) {
		t.Errorf("CreateSubAccount: got %v, want ErrInvalidName", err)
	}
}

func TestGetAccount(t *testing.T) {
	svc := newService(t)
	user := mustCreateUser(t, svc, "foo-user")

	got, err := svc.GetAccount(t.Context(), user.ID)
	if err != nil {
		t.Fatalf("GetAccount: %v", err)
	}
	if got.ID != user.ID || got.Name != user.Name {
		t.Fatalf("got %+v, want %+v", got, user)
	}

	if _, err := svc.GetAccount(t.Context(), "no-such-account"); !errors.Is(err, accounts.ErrNotFound) {
		t.Fatalf("missing account: got %v, want ErrNotFound", err)
	}
}

func TestListSubAccountsReturnsOnlyOwned(t *testing.T) {
	svc := newService(t)
	alice := mustCreateUser(t, svc, "alice-user")
	bob := mustCreateUser(t, svc, "bob-the-user")
	a1 := mustCreateSub(t, svc, alice.ID, "turtle-a1")
	a2 := mustCreateSub(t, svc, alice.ID, "turtle-a2")
	mustCreateSub(t, svc, bob.ID, "turtle-b1")

	subs, err := svc.ListSubAccounts(t.Context(), alice.ID)
	if err != nil {
		t.Fatalf("ListSubAccounts: %v", err)
	}
	var ids []string
	for _, s := range subs {
		ids = append(ids, s.ID)
	}
	slices.Sort(ids)
	want := []string{a1.ID, a2.ID}
	slices.Sort(want)
	if !slices.Equal(ids, want) {
		t.Fatalf("got %v, want only alice's %v", ids, want)
	}

	empty := mustCreateUser(t, svc, "no-subs-user")
	subs, err = svc.ListSubAccounts(t.Context(), empty.ID)
	if err != nil || len(subs) != 0 {
		t.Fatalf("user without sub-accounts: got %v, %v; want none, nil", subs, err)
	}
}

func TestDisableAccount(t *testing.T) {
	svc := newService(t)
	user := mustCreateUser(t, svc, "foo-user")

	if err := svc.DisableAccount(t.Context(), user.ID); err != nil {
		t.Fatalf("DisableAccount: %v", err)
	}
	first, err := svc.GetAccount(t.Context(), user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if first.DisabledAt == nil {
		t.Fatal("DisabledAt not set after disabling")
	}

	t.Run("disabling again keeps the original time", func(t *testing.T) {
		if err := svc.DisableAccount(t.Context(), user.ID); err != nil {
			t.Fatalf("second DisableAccount: %v", err)
		}
		again, err := svc.GetAccount(t.Context(), user.ID)
		if err != nil {
			t.Fatal(err)
		}
		if again.DisabledAt == nil || !again.DisabledAt.Equal(*first.DisabledAt) {
			t.Fatalf("DisabledAt changed from %v to %v", first.DisabledAt, again.DisabledAt)
		}
	})

	t.Run("missing account", func(t *testing.T) {
		if err := svc.DisableAccount(t.Context(), "no-such-account"); !errors.Is(err, accounts.ErrNotFound) {
			t.Fatalf("got %v, want ErrNotFound", err)
		}
	})
}
