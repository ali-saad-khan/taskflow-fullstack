<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TaskMoveTest extends TestCase
{
    use RefreshDatabase;

    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->project = Project::factory()->for($user)->create();
        Sanctum::actingAs($user);
    }

    /** @return list<Task> */
    private function column(string $status, int $n): array
    {
        $tasks = [];
        for ($i = 0; $i < $n; $i++) {
            $tasks[] = Task::factory()->for($this->project)->create(['title' => "$status-$i", 'status' => $status, 'position' => $i]);
        }

        return $tasks;
    }

    /** @return list<string> titles in column order */
    private function titles(string $status): array
    {
        return Task::where('project_id', $this->project->id)->where('status', $status)
            ->orderBy('position')->pluck('title')->all();
    }

    private function positions(string $status): array
    {
        return Task::where('project_id', $this->project->id)->where('status', $status)
            ->orderBy('position')->pluck('position')->all();
    }

    public function test_move_within_column_downwards(): void
    {
        [$a] = $this->column('todo', 4);

        $this->postJson("/api/v1/tasks/{$a->id}/move", ['status' => 'todo', 'position' => 2])
            ->assertOk()->assertJsonPath('data.position', 2);

        $this->assertSame(['todo-1', 'todo-2', 'todo-0', 'todo-3'], $this->titles('todo'));
        $this->assertSame([0, 1, 2, 3], $this->positions('todo'));
    }

    public function test_move_within_column_upwards(): void
    {
        $tasks = $this->column('todo', 4);

        $this->postJson("/api/v1/tasks/{$tasks[3]->id}/move", ['status' => 'todo', 'position' => 0])->assertOk();

        $this->assertSame(['todo-3', 'todo-0', 'todo-1', 'todo-2'], $this->titles('todo'));
    }

    public function test_move_across_columns_renumbers_both(): void
    {
        $todo = $this->column('todo', 3);
        $this->column('doing', 2);

        $this->postJson("/api/v1/tasks/{$todo[0]->id}/move", ['status' => 'doing', 'position' => 1])
            ->assertOk()->assertJsonPath('data.status', 'doing');

        $this->assertSame(['todo-1', 'todo-2'], $this->titles('todo'));
        $this->assertSame([0, 1], $this->positions('todo'));
        $this->assertSame(['doing-0', 'todo-0', 'doing-1'], $this->titles('doing'));
        $this->assertSame([0, 1, 2], $this->positions('doing'));
    }

    public function test_move_into_empty_column(): void
    {
        [$a] = $this->column('todo', 1);

        $this->postJson("/api/v1/tasks/{$a->id}/move", ['status' => 'done', 'position' => 0])->assertOk();

        $this->assertSame(['todo-0'], $this->titles('done'));
        $this->assertSame([], $this->titles('todo'));
    }

    public function test_position_beyond_end_is_clamped(): void
    {
        $todo = $this->column('todo', 1);
        $this->column('done', 2);

        $this->postJson("/api/v1/tasks/{$todo[0]->id}/move", ['status' => 'done', 'position' => 99])
            ->assertOk()->assertJsonPath('data.position', 2);
        $this->assertSame([0, 1, 2], $this->positions('done'));
    }

    public function test_move_does_not_touch_other_projects(): void
    {
        $other = Task::factory()->for(Project::factory()->for($this->project->user)->create())
            ->create(['status' => 'todo', 'position' => 5]);
        [$a] = $this->column('todo', 2);

        $this->postJson("/api/v1/tasks/{$a->id}/move", ['status' => 'doing', 'position' => 0])->assertOk();

        $this->assertSame(5, $other->fresh()->position);
    }

    public function test_move_validates_payload(): void
    {
        [$a] = $this->column('todo', 1);

        $this->postJson("/api/v1/tasks/{$a->id}/move", [])->assertStatus(422)->assertJsonValidationErrors(['status', 'position']);
        $this->postJson("/api/v1/tasks/{$a->id}/move", ['status' => 'nope', 'position' => -1])
            ->assertStatus(422)->assertJsonValidationErrors(['status', 'position']);
    }

    public function test_failed_move_rolls_back_in_a_transaction(): void
    {
        $todo = $this->column('todo', 3);
        $this->column('doing', 2);

        // Let the first two UPDATEs succeed, then blow up mid-renumbering: everything must roll back.
        $updates = 0;
        DB::listen(function ($query) use (&$updates) {
            if (str_starts_with($query->sql, 'update "tasks"') && ++$updates === 3) {
                throw new \RuntimeException('boom');
            }
        });

        $before = Task::orderBy('id')->get(['id', 'status', 'position'])->toArray();

        try {
            app(\App\Services\TaskOrdering::class)->move($todo[0], \App\Enums\TaskStatus::Doing, 0);
            $this->fail('expected exception');
        } catch (\RuntimeException $e) {
            $this->assertSame('boom', $e->getMessage());
        }

        $this->assertSame($before, Task::orderBy('id')->get(['id', 'status', 'position'])->toArray());
    }
}
