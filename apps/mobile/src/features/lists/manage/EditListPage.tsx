import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import {
  listRenamed,
  selectListById,
  selectListMembers,
} from '../domain/listsSlice'
import {
  listPreferencesSet,
  selectListPreferences,
} from '../../preferences/domain/preferencesSlice'
import { ListEditor } from './ListEditor'

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="text-muted-foreground size-[18px] fill-current">
      <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" />
    </svg>
  )
}

type EditListPageProps = {
  readonly listId: string
}

/**
 * Page for editing an existing shopping list: name and local preferences.
 * Members are not edited here — the row leads to the members screen,
 * where invites are minted and members removed (owner model).
 * @param props.listId ID of the shopping list to edit, from the route params.
 */
export function EditListPage({ listId }: EditListPageProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))
  const preferences = useAppSelector((state) =>
    selectListPreferences(state, listId),
  )
  const memberCount = useAppSelector(
    (state) => selectListMembers(state, listId).length,
  )

  if (!list) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-muted-foreground">Liste nicht gefunden</p>
      </div>
    )
  }

  return (
    <ListEditor
      title="Liste bearbeiten"
      submitLabel="Speichern"
      initialValues={{
        emoji: preferences?.emoji ?? '\u{1F6D2}',
        name: list.name,
        color: preferences?.color ?? 'green',
      }}
      extraSection={
        <button
          className="bg-card mx-6 mb-4 flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:opacity-70"
          onClick={() =>
            void navigate({
              to: '/lists/$listId/members',
              params: { listId },
            })
          }
        >
          <span className="flex-1 text-[15px] font-semibold">Mitglieder</span>
          <span className="text-muted-foreground text-[15px]">
            {memberCount}
          </span>
          <ChevronIcon />
        </button>
      }
      onSubmit={(result) => {
        dispatch(listRenamed({ listId, name: result.name }))
        dispatch(
          listPreferencesSet({
            listId,
            preferences: { color: result.color, emoji: result.emoji },
          }),
        )
        navigate({ to: '/lists' })
      }}
    />
  )
}
