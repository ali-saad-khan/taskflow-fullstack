<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TaskTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->me = User::factory()->create();
        $this->project = Project::factory()->for($this->me)->create();
        Sanctum::actingAs($this->me);
    }

    public function test_create_task_with_defaults(): void
    {
        $this->postJson("/api/v1/projects/{$this->project->id}/tasks", ['title' => 'Write tests'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'todo')
            ->assertJsonPath('data.priority', 'medium')
            ->assertJsonPath('data.position', 0)
            ->assertJsonPath('data.due_date', null);
    }

    public function test_new_tasks_are_appended_to_the_end_of_their_column(): void
    {
        $url = "/api/v1/projects/{$this->project->id}/tasks";
        $this->postJson($url, ['title' => 'A'])->assertJsonPath('data.position', 0);
        $this->postJson($url, ['title' => 'B'])->assertJsonPath('data.position', 1);
        $this->postJson($url, ['title' => 'C', 'status' => 'doing'])->assertJsonPath('data.position', 0);
    }

    public function test_create_validates_fields(): void
    {
        $this->postJson("/api/v1/projects/{$this->project->id}/tasks", [
            'title' => '', 'status' => 'blocked', 'priority' => 'urgent', 'due_date' => '31/12/2026',
        ])->assertStatus(422)->assertJsonValidationErrors(['title', 'status', 'priority', 'due_date']);
    }

    public function test_index_returns_tasks_ordered_by_column_position(): void
    {
        Task::factory()->for($this->project)->create(['title' => 'second', 'status' => 'todo', 'position' => 1]);
        Task::factory()->for($this->project)->create(['title' => 'first', 'status' => 'todo', 'position' => 0]);

        $this->getJson("/api/v1/projects/{$this->project->id}/tasks")
            ->assertOk()
            ->assertJsonPath('data.0.title', 'first')
            ->assertJsonPath('data.1.title', 'second');
    }

    public function test_show_and_update_task(): void
    {
        $task = Task::factory()->for($this->project)->create(['title' => 'Old', 'priority' => 'low']);

        $this->getJson("/api/v1/tasks/{$task->id}")->assertOk()->assertJsonPath('data.title', 'Old');
        $this->patchJson("/api/v1/tasks/{$task->id}", ['title' => 'New', 'priority' => 'high', 'due_date' => '2026-12-31'])
            ->assertOk()
            ->assertJsonPath('data.title', 'New')
            ->assertJsonPath('data.priority', 'high')
            ->assertJsonPath('data.due_date', '2026-12-31');
    }

    public function test_update_can_clear_due_date_and_rejects_empty_title(): void
    {
        $task = Task::factory()->for($this->project)->create(['due_date' => '2026-01-01']);

        $this->patchJson("/api/v1/tasks/{$task->id}", ['due_date' => null])->assertOk()->assertJsonPath('data.due_date', null);
        $this->patchJson("/api/v1/tasks/{$task->id}", ['title' => ''])->assertStatus(422)->assertJsonValidationErrors('title');
    }

    public function test_update_status_moves_task_to_end_of_target_column(): void
    {
        Task::factory()->for($this->project)->create(['status' => 'doing', 'position' => 0]);
        $task = Task::factory()->for($this->project)->create(['status' => 'todo', 'position' => 0]);

        $this->patchJson("/api/v1/tasks/{$task->id}", ['status' => 'doing'])
            ->assertOk()
            ->assertJsonPath('data.status', 'doing')
            ->assertJsonPath('data.position', 1);
    }

    public function test_delete_task_closes_the_gap(): void
    {
        $a = Task::factory()->for($this->project)->create(['position' => 0]);
        $b = Task::factory()->for($this->project)->create(['position' => 1]);
        $c = Task::factory()->for($this->project)->create(['position' => 2]);

        $this->deleteJson("/api/v1/tasks/{$a->id}")->assertNoContent();

        $this->assertSame(0, $b->fresh()->position);
        $this->assertSame(1, $c->fresh()->position);
    }

    public function test_cannot_touch_tasks_in_another_users_project(): void
    {
        $theirs = Project::factory()->create();
        $task = Task::factory()->for($theirs)->create();

        $this->getJson("/api/v1/projects/{$theirs->id}/tasks")->assertForbidden();
        $this->postJson("/api/v1/projects/{$theirs->id}/tasks", ['title' => 'x'])->assertForbidden();
        $this->getJson("/api/v1/tasks/{$task->id}")->assertForbidden();
        $this->patchJson("/api/v1/tasks/{$task->id}", ['title' => 'x'])->assertForbidden();
        $this->postJson("/api/v1/tasks/{$task->id}/move", ['status' => 'done', 'position' => 0])->assertForbidden();
        $this->deleteJson("/api/v1/tasks/{$task->id}")->assertForbidden();
        $this->assertDatabaseCount('tasks', 1);
    }
}
