<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $over = []): array
    {
        return array_merge([
            'name' => 'Ada',
            'email' => 'ada@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ], $over);
    }

    public function test_register_returns_user_and_token(): void
    {
        $this->postJson('/api/v1/auth/register', $this->payload())
            ->assertCreated()
            ->assertJsonStructure(['user' => ['id', 'name', 'email'], 'token'])
            ->assertJsonMissingPath('user.password');

        $this->assertDatabaseHas('users', ['email' => 'ada@example.com']);
    }

    public function test_register_validates_input(): void
    {
        $this->postJson('/api/v1/auth/register', [])
            ->assertStatus(422)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonValidationErrors(['name', 'email', 'password']);
    }

    public function test_register_rejects_duplicate_email_and_weak_password(): void
    {
        User::factory()->create(['email' => 'ada@example.com']);

        $this->postJson('/api/v1/auth/register', $this->payload(['password' => 'short', 'password_confirmation' => 'short']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_login_with_valid_credentials(): void
    {
        User::factory()->create(['email' => 'ada@example.com', 'password' => 'password123']);

        $this->postJson('/api/v1/auth/login', ['email' => 'ada@example.com', 'password' => 'password123'])
            ->assertOk()
            ->assertJsonStructure(['user', 'token']);
    }

    public function test_login_with_wrong_password_is_401_with_error_shape(): void
    {
        User::factory()->create(['email' => 'ada@example.com', 'password' => 'password123']);

        $this->postJson('/api/v1/auth/login', ['email' => 'ada@example.com', 'password' => 'nope'])
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Invalid credentials.', 'code' => 'invalid_credentials']);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/v1/auth/me')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }

    public function test_me_returns_current_user_with_real_token(): void
    {
        $token = $this->postJson('/api/v1/auth/register', $this->payload())->json('token');

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'ada@example.com');
    }

    public function test_logout_revokes_the_token(): void
    {
        $token = $this->postJson('/api/v1/auth/register', $this->payload())->json('token');

        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertDatabaseCount('personal_access_tokens', 0);

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_login_is_rate_limited(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/v1/auth/login', ['email' => 'x@example.com', 'password' => 'bad'])
                ->assertUnauthorized();
        }

        $this->postJson('/api/v1/auth/login', ['email' => 'x@example.com', 'password' => 'bad'])
            ->assertStatus(429)
            ->assertJsonPath('code', 'too_many_requests');
    }

    public function test_unknown_api_route_returns_json_404(): void
    {
        $this->getJson('/api/v1/nope')->assertNotFound()->assertJsonPath('code', 'not_found');
    }

    public function test_unauthenticated_request_without_accept_header_still_gets_json_401(): void
    {
        $this->get('/api/v1/projects')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
    }
}
