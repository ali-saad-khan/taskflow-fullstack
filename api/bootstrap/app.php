<?php

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // The API is JSON-only: never redirect guests to a (non-existent) login page.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());

        // Every API error has the shape { message, code, errors? }.
        $error = fn (string $message, string $code, int $status, array $extra = []) => response()->json(
            ['message' => $message, 'code' => $code] + $extra,
            $status,
        );

        $exceptions->render(fn (ValidationException $e, Request $r) => $error('The given data was invalid.', 'validation_failed', 422, ['errors' => $e->errors()]));
        $exceptions->render(fn (AuthenticationException $e, Request $r) => $error('Unauthenticated.', 'unauthenticated', 401));
        $exceptions->render(fn (AuthorizationException $e, Request $r) => $error('This action is unauthorized.', 'forbidden', 403));
        $exceptions->render(fn (AccessDeniedHttpException $e, Request $r) => $error('This action is unauthorized.', 'forbidden', 403));
        $exceptions->render(fn (ModelNotFoundException $e, Request $r) => $error('Resource not found.', 'not_found', 404));
        $exceptions->render(fn (NotFoundHttpException $e, Request $r) => $error('Resource not found.', 'not_found', 404));
        $exceptions->render(fn (ThrottleRequestsException $e, Request $r) => response()->json(
            ['message' => 'Too many requests.', 'code' => 'too_many_requests'],
            429,
            $e->getHeaders(),
        ));
    })->create();
